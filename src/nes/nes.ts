// NES: Nintendo Entertainment System

import {Apu} from './apu'
import {kColors} from './const'
import {Cpu} from './cpu'
import {Ppu, MirrorMode} from './ppu'
import Util from '../util/util'

import {Mapper, PrgBankController} from './mapper/mapper'
import {kMapperTable} from './mapper/mapper_table'

const RAM_SIZE = 0x0800

const VBLANK_START = 241
const VBLANK_NMI = 242
const VBLANK_END = 261
const VRETURN = 262
const VCYCLE = (VRETURN * 341 / 3) | 0

const OAMDMA = 0x4014

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

export class Nes implements PrgBankController {
  public cpu: Cpu
  public ram = new Uint8Array(RAM_SIZE)
  public ppu: Ppu
  public apu: Apu
  public cycleCount = 0

  private romData = new Uint8Array(0)
  private mapperNo = 0
  private mapper: Mapper = null
  private vblankCallback: (leftV: number) => void
  private breakPointCallback: () => void
  private prgBank: number[]

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
    this.cpu = new Cpu()
    this.ppu = new Ppu()
    this.apu = new Apu(() => { this.cpu.requestIrq() })
    this.vblankCallback = (_leftV) => {}
    this.breakPointCallback = () => {}
  }

  public setVblankCallback(callback: (leftV: number) => void): void {
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
    this.ppu.setMirrorMode((romData[6] & 1) === 0 ? MirrorMode.HORZ : MirrorMode.VERT)
    this.cpu.deleteAllBreakPoints()

    this.setMemoryMap(this.mapperNo)

    return true
  }

  public save(): object {
    return {
      cpu: this.cpu.save(),
      ppu: this.ppu.save(),
      mapper: this.mapper.save(),
      ram: Util.convertUint8ArrayToBase64String(this.ram),
    }
  }

  public load(saveData: any): void {
    this.reset()
    this.cpu.load(saveData.cpu)
    this.ppu.load(saveData.ppu)
    this.mapper.load(saveData.mapper)
    this.ram = Util.convertBase64StringToUint8Array(saveData.ram)
  }

  public reset(): void {
    this.ram.fill(0xff)
    this.cpu.reset()
    this.ppu.reset()
    this.apu.reset()
    this.cycleCount = 0

    if (this.mapper != null)
      this.mapper.reset()
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

  public render(pixels: Uint8ClampedArray): void {
    this.ppu.render(pixels)
  }

  public renderNameTable1(pixels: Uint8ClampedArray, lineWidth: number,
                          startX: number, startY: number, page: number): void
  {
    this.ppu.renderNameTable1(pixels, lineWidth, startX, startY, page << 10)
  }

  public renderPatternTable(pixels: Uint8ClampedArray, lineWidth: number, colors: number[]): void {
    this.ppu.renderPattern(pixels, lineWidth, colors)
  }

  public getPalet(pal: number): number {
    const vram = this.ppu.vram
    const paletTable = 0x3f00
    return vram[paletTable + (pal & 31)] & 0x3f
  }

  public setPrgBank(bank: number, page: number): void {
    this.prgBank[bank] = page << 13
  }

  private setMemoryMap(mapperNo: number): void {
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
          // TODO: Consume CPU or GPU cycles.
        } else {
          console.error(`OAMDMA not implemented except for RAM: ${Util.hex(value, 2)}`)
        }
        break
      default:
        this.apu.write(adr, value)
        break
      }
    })

    // PRG ROM
    const prgMask = this.romData.length - 1
    this.prgBank = [0x0000,  // 0x8000~
                    0x2000,  // 0xa000~
                    -0x4000 & prgMask,  // 0xc000~
                    -0x2000 & prgMask]  // 0xe000~
    cpu.setReadMemory(0x8000, 0xffff, (adr) => {
      const bank = (adr - 0x8000) >> 13
      const offset = adr & ((1 << 13) - 1)
      const prgSize = this.romData.length
      return this.romData[(this.prgBank[bank] + offset) & (prgSize - 1)]
    })

    // RAM
    cpu.setReadMemory(0x0000, 0x1fff, (adr) => this.ram[adr & (RAM_SIZE - 1)])
    cpu.setWriteMemory(0x0000, 0x1fff, (adr, value) => { this.ram[adr & (RAM_SIZE - 1)] = value })

    this.mapper = this.createMapper(mapperNo)
  }

  private createMapper(mapperNo: number): Mapper {
    console.log(`Mapper ${mapperNo}`)
    if (!(mapperNo in kMapperTable)) {
      console.error(`  not supported`)
      mapperNo = 0
    }
    const mapperFunc = kMapperTable[mapperNo]
    return mapperFunc(this, this.romData.length, this.cpu, this.ppu)
  }

  private tryHblankEvent(cycleCount: number, cycle: number, leftCycles: number): number {
    let cycleCount2 = cycleCount + cycle
    const beforeHcount = getHblankCount(cycleCount)
    let hcount = getHblankCount(cycleCount2)
    if (hcount > beforeHcount) {
      this.ppu.setHcount(hcount)
      this.apu.onHblank(hcount)

      switch (hcount) {
      case VBLANK_START:
        this.vblankCallback((leftCycles / VCYCLE) | 0)
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
        break
      default:
        break
      }

      this.mapper.onHblank(hcount)
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
