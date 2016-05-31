// NES: Nintendo Entertainment System

import {Apu} from './apu.ts'
import {Const, kColors} from './const.ts'
import {Cpu6502} from './cpu.ts'
import {Ppu} from './ppu.ts'
import {Util} from './util.ts'

const RAM_SIZE = 0x0800

const DUMMY_SPRITE0HIT = (20 * 341 / 3) | 0
const VBLANK_START = (241 * 341 / 3) | 0
const VBLANK_NMI = (242 * 341 / 3) | 0
const VBLANK_END = (261 * 341 / 3) | 0
const VRETURN = (262 * 341 / 3) | 0

function triggerCycle(count: number, prev: number, curr: number): boolean {
  return prev < count && curr >= count
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

  private romData: Uint8Array
  private mapperNo: number

  public static create(): Nes {
    return new Nes()
  }

  constructor() {
    this.cpu = new Cpu6502()
    this.ram = new Uint8Array(RAM_SIZE)
    this.ppu = new Ppu()
    this.apu = new Apu()
    this.mapperNo = 0
    this.setMemoryMap(0)

    this.romData = new Uint8Array(0)
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
    this.cpu.reset()
    this.ppu.reset()
    this.apu.reset()
  }

  public setPadStatus(no: number, status: number): void {
    this.apu.setPadStatus(no, status)
  }

  public runCycles(cycles: number): number {
    try {
      while (cycles > 0 && !this.cpu.isPaused()) {
        const c = this.step()
        cycles -= c
      }
      return -cycles
    } catch (e) {
      console.error(e)
      this.cpu.pause(true)
    }
  }

  public step(): number {
    const prevCount = this.cpu.cycleCount
    const cycle = this.cpu.step()
    const currCount = this.cpu.cycleCount

    if (triggerCycle(DUMMY_SPRITE0HIT, prevCount, currCount)) {
      this.ppu.setSprite0Hit()
    }
    if (triggerCycle(VBLANK_START, prevCount, currCount)) {
      this.ppu.setVBlank()
    }
    if (triggerCycle(VBLANK_NMI, prevCount, currCount)) {
      this.interruptVBlank()
    }
    if (triggerCycle(VBLANK_END, prevCount, currCount)) {
      this.ppu.clearVBlank()
    }
    if (triggerCycle(VRETURN, prevCount, currCount)) {
      this.cpu.cycleCount -= VRETURN
    }
    return cycle
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
    const cpu = this.cpu
    console.log(`Mapper ${Util.hex(mapperNo, 2)}`)

    switch (mapperNo) {
    default:
      console.error(`  not implemented`)
      // Fall
    case 0:
      // ROM
      cpu.setReadMemory(0x8000, 0xbfff, (adr) => this.romData[adr & (this.romData.length - 1)])
      cpu.setReadMemory(0xc000, 0xffff, (adr) => this.romData[adr & (this.romData.length - 1)])
      break

    case 0x03:
      // ROM
      cpu.setReadMemory(0x8000, 0xbfff, (adr) => this.romData[adr & (this.romData.length - 1)])
      cpu.setReadMemory(0xc000, 0xffff, (adr) => this.romData[adr & (this.romData.length - 1)])

      // Chr ROM bank
      cpu.setWriteMemory(0x8000, 0xffff, (adr, value) => {
        this.ppu.setChrBank(value)
      })
      break
    }
  }

  private interruptVBlank(): void {
    if (!this.ppu.interruptEnable())
      return
    this.interruptNmi()
  }

  private interruptNmi(): void {
    this.cpu.nmi()
  }

  public getPalet(pal: number): number {
    const vram = this.ppu.vram
    const paletTable = 0x3f00
    return vram[paletTable + (pal & 31)] & 0x3f
  }

  public static getPaletColorString(col: number): string {
    const r = kColors[col * 3]
    const g = kColors[col * 3 + 1]
    const b = kColors[col * 3 + 2]
    return `rgb(${r},${g},${b})`
  }
}
