// NES: Nintendo Entertainment System

import {Apu} from './apu.ts'
import {kColors} from './const.ts'
import {Cpu6502} from './cpu.ts'
import {Ppu} from './ppu.ts'
import {Util} from './util.ts'

import {kMapperTable} from './mapper/mapper_table.ts'

const RAM_SIZE = 0x0800

const VBLANK_START = 241
const VBLANK_NMI = 242
const VBLANK_END = 261
const VRETURN = 262
const VCYCLE = (VRETURN * 341 / 3) | 0

function getHblankCount(cpuCycle: number): number {
  return (cpuCycle * (3 / 341)) | 0
}

function isRomValid(romData: Uint8Array): boolean {
  // Check header.
  if (!(romData[0] === 0x4e && romData[1] === 0x45 && romData[2] === 0x53 &&
        romData[3] === 0x1a))
    return false
  return true
}

function getMapperNo(romData: Uint8Array): number {
  return ((romData[6] >> 4) & 0x0f) | (romData[7] & 0xf0)
}

function loadPrgRom(romData: Uint8Array): Uint8Array {
  const start = 16, size = romData[4] * (16 * 1024)
  const prg = romData.slice(start, start + size)
  return new Uint8Array(prg)
}

function loadChrRom(romData: Uint8Array): Uint8Array {
  const start = 16 + romData[4] * (16 * 1024), size = romData[5] * (8 * 1024)
  const chr = romData.slice(start, start + size)
  return new Uint8Array(chr)
}

export class Nes {
  public apu: Apu
  public cpu: Cpu6502
  public ram: Uint8Array
  public ppu: Ppu
  public cycleCount: number

  private romData: Uint8Array
  private mapperNo: number
  private vblankCallback: (leftCycles: number) => void
  private breakPointCallback: () => void
  private irqHlineEnable: boolean
  private irqHlineValue: number
  private irqHlineCounter: number

  public static create(): Nes {
    return new Nes()
  }

  public static getPaletColorString(col: number): string {
    const r = kColors[col * 3]
    const g = kColors[col * 3 + 1]
    const b = kColors[col * 3 + 2]
    return `rgb(${r},${g},${b})`
  }

  constructor() {
    this.cpu = new Cpu6502()
    this.ram = new Uint8Array(RAM_SIZE)
    this.ppu = new Ppu()
    this.apu = new Apu()
    this.mapperNo = 0
    this.cycleCount = 0
    this.vblankCallback = (_leftCycles) => {}
    this.breakPointCallback = () => {}
    this.irqHlineEnable = false
    this.irqHlineValue = this.irqHlineCounter = -1

    this.romData = new Uint8Array(0)
  }

  public setVblankCallback(callback: (leftCycles: number) => void): void {
    this.vblankCallback = callback
  }

  public setBreakPointCallback(callback: () => void): void {
    this.breakPointCallback = callback
  }

  public setRomData(romData: Uint8Array): boolean {
    if (!isRomValid(romData))
      return false
    this.mapperNo = getMapperNo(romData)
    this.romData = loadPrgRom(romData)
    this.ppu.setChrData(loadChrRom(romData))
    this.ppu.setMirrorMode(romData[6] & 1)
    this.cpu.deleteAllBreakPoints()

    this.setMemoryMap(this.mapperNo)

    return true
  }

  public reset(): void {
    this.ram.fill(0xff)
    this.cpu.reset()
    this.ppu.reset()
    this.apu.reset()
    this.cycleCount = 0
    this.irqHlineEnable = false
    this.irqHlineValue = this.irqHlineCounter = -1
  }

  public setPadStatus(no: number, status: number): void {
    this.apu.setPadStatus(no, status)
  }

  public runCycles(cycles: number): number {
    try {
      let leftCycles = cycles
      while (leftCycles > 0) {
        const c = this.step(leftCycles)
        leftCycles -= c
        if (this.cpu.isPaused()) {  // Hit break point.
          this.breakPointCallback()
          return 0
        }
      }
      return -cycles
    } catch (e) {
      this.cpu.pause(true)
      throw e
    }
  }

  public step(leftCycles?: number): number {
    const cycle = this.cpu.step()
    this.cycleCount = this.tryHblankEvent(this.cycleCount, cycle, leftCycles)
    return cycle
  }

  public enableIrqHline(value: boolean): void {
    this.irqHlineEnable = value
  }

  public setIrqHlineValue(line: number): void {
    this.irqHlineValue = line
  }

  public resetIrqHlineCounter(): void {
    this.irqHlineCounter = 0
  }

  public render(context: CanvasRenderingContext2D, imageData: ImageData): void {
    this.ppu.renderBg(imageData)
    this.ppu.renderSprite(imageData)
    context.putImageData(imageData, 0, 0)
  }

  public renderNameTable(bgCanvas: HTMLCanvasElement): void {
    const context = bgCanvas.getContext('2d')
    const imageData = context.getImageData(0, 0, bgCanvas.width, bgCanvas.height)
    this.ppu.doRenderBg(imageData, 0, 0, 0, 0, 0)
    this.ppu.doRenderBg(imageData, 0, 0, 256, 0, this.ppu.mirrorMode === 0 ? 0x0800 : 0x0400)
    context.putImageData(imageData, 0, 0)
  }

  public renderPatternTable(bgCanvas: HTMLCanvasElement, colors: number[]): void {
    const context = bgCanvas.getContext('2d')
    const imageData = context.getImageData(0, 0, bgCanvas.width, bgCanvas.height)
    this.ppu.renderPattern(imageData, colors)
    context.putImageData(imageData, 0, 0)
  }

  public getPalet(pal: number): number {
    const vram = this.ppu.vram
    const paletTable = 0x3f00
    return vram[paletTable + (pal & 31)] & 0x3f
  }

  private setMemoryMap(mapperNo: number): void {
    const OAMDMA = 0x4014

    const cpu = this.cpu
    cpu.resetMemoryMap()

    cpu.setReadMemory(0x2000, 0x3fff, (adr) => {  // PPU
      const reg = adr & 7
      return this.ppu.read(reg)
    })
    cpu.setWriteMemory(0x2000, 0x3fff, (adr, value) => {  // PPU
      const reg = adr & 7
      this.ppu.write(reg, value)
    })

    cpu.setReadMemory(0x4000, 0x5fff, (adr) => {  // APU
      return this.apu.read(adr)
    })
    cpu.setWriteMemory(0x4000, 0x5fff, (adr, value) => {  // APU
      switch (adr) {
      case OAMDMA:
        if (0 <= value && value <= 0x1f) {  // RAM
          this.ppu.copyWithDma(this.ram, value << 8)
        } else {
          console.error(`OAMDMA not implemented except for RAM: ${Util.hex(value, 2)}`)
        }
        break
      default:
        this.apu.write(adr, value)
        break
      }
    })

    // RAM
    cpu.setReadMemory(0x0000, 0x1fff, (adr) => this.ram[adr & (RAM_SIZE - 1)])
    cpu.setWriteMemory(0x0000, 0x1fff, (adr, value) => { this.ram[adr & (RAM_SIZE - 1)] = value })

    this.setMemoryMapForMapper(mapperNo)
  }

  private setMemoryMapForMapper(mapperNo: number): void {
    console.log(`Mapper ${Util.hex(mapperNo, 2)}`)
    if (mapperNo in kMapperTable) {
      kMapperTable[mapperNo](this.romData, this.cpu, this.ppu, this)
    } else {
      console.error(`  not supported`)
      // Use mapper 0
      kMapperTable[0](this.romData, this.cpu, this.ppu, this)
    }
  }

  private tryHblankEvent(cycleCount: number, cycle: number, leftCycles: number): number {
    let cycleCount2 = cycleCount + cycle
    const beforeHcount = getHblankCount(cycleCount)
    let hcount = getHblankCount(cycleCount2)
    if (hcount > beforeHcount) {
      this.ppu.setHcount(hcount)

      switch (hcount) {
      case VBLANK_START:
        if (this.apu.isIrqEnabled()) {
          this.cpu.requestIrq()
        }
        this.vblankCallback(leftCycles / VCYCLE)
        this.ppu.setVBlank()
        break
      case VBLANK_NMI:
        this.interruptVBlank()
        break
      case VBLANK_END:
        this.ppu.clearVBlank()
        break
      case VRETURN:
        cycleCount2 -= (VRETURN * 341 / 3) | 0
        this.ppu.hcount = 0
        this.irqHlineCounter = this.irqHlineValue
        break
      default:
        break
      }

      // http://bobrost.com/nes/files/mmc3irqs.txt
      // Note: BGs OR sprites MUST be enabled in $2001 (bits 3 and 4)
      // in order for the countdown to occur.
      if ((this.ppu.regs[1] & 0x18) !== 0) {
        if (--this.irqHlineCounter === 0 && this.irqHlineEnable) {
          this.cpu.requestIrq()
        }
      }
    }
    return cycleCount2
  }

  private interruptVBlank(): void {
    if (!this.ppu.interruptEnable())
      return
    this.interruptNmi()
  }

  private interruptNmi(): void {
    this.cpu.nmi()
  }
}
