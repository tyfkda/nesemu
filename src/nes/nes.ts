// NES: Nintendo Entertainment System

import {Apu, ChannelType} from './apu'
import {Bus} from './bus'
import {Cpu} from './cpu/cpu'
import {MirrorMode} from './ppu/types'
import {kColors} from './ppu/const'
import {Ppu} from './ppu/ppu'
import {Address, Byte} from './types'
import Util from '../util/util'

import {Mapper, PrgBankController} from './mapper/mapper'
import {kMapperTable} from './mapper/mapper_table'

import * as md5 from 'md5'

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
  protected ram = new Uint8Array(RAM_SIZE)
  protected bus: Bus
  protected cpu: Cpu
  protected ppu: Ppu
  protected apu: Apu
  protected cycleCount = 0

  protected mapper: Mapper
  private prgRom = new Uint8Array(0)
  private vblankCallback: (leftV: number) => void
  private breakPointCallback: () => void
  private prgBank: number[] = []
  private apuChannelCount = 0

  public static create(): Nes {
    return new Nes()
  }

  public getPaletColorTable(): Uint8Array {
    return kColors
  }

  constructor() {
    this.bus = new Bus()
    this.cpu = new Cpu(this.bus)
    this.ppu = new Ppu()
    this.apu = new Apu(() => { this.cpu.requestIrq() })
    this.vblankCallback = (_leftV) => {}
    this.breakPointCallback = () => {}

    const mapperNo = 0
    this.mapper = this.createMapper(mapperNo, -1)
    this.setMemoryMap()
  }

  public getBus(): Bus { return this.bus }
  public getCpu(): Cpu { return this.cpu }
  public getPpu(): Ppu { return this.ppu }
  public getCycleCount(): number { return this.cycleCount }

  public setVblankCallback(callback: (leftV: number) => void): void {
    this.vblankCallback = callback
  }

  public setBreakPointCallback(callback: () => void): void {
    this.breakPointCallback = callback
  }

  public setRomData(romData: Uint8Array): boolean|string {
    if (!isRomValid(romData))
      return 'Invalid format'
    const mapperNo = getMapperNo(romData)
    if (!(mapperNo in kMapperTable))
      return `Mapper ${mapperNo} not supported`

    this.prgRom = loadPrgRom(romData)
    this.ppu.setChrData(loadChrRom(romData))
    this.ppu.setMirrorMode((romData[6] & 1) === 0 ? MirrorMode.HORZ : MirrorMode.VERT)
    this.cpu.deleteAllBreakPoints()

    this.setMemoryMap()
    const romHash = md5(romData)
    this.mapper = this.createMapper(mapperNo, this.prgRom.length, romHash)

    return true
  }

  public setMapper(mapper: Mapper): void {
    this.mapper = mapper
  }

  public save(): object {
    return {
      cpu: this.cpu.save(),
      ppu: this.ppu.save(),
      apu: this.apu.save(),
      mapper: this.mapper != null ? this.mapper.save() : null,
      ram: Util.convertUint8ArrayToBase64String(this.ram),
    }
  }

  public load(saveData: any): void {
    this.reset()
    this.cpu.load(saveData.cpu)
    this.ppu.load(saveData.ppu)
    this.apu.load(saveData.apu)
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

  public step(leftCycles: number): number {
    const cycle = this.cpu.step()
    this.cycleCount = this.tryHblankEvent(this.cycleCount, cycle, leftCycles)
    return cycle
  }

  public getSoundChannelTypes(): ChannelType[] {
    const channels = this.apu.getChannelTypes()
    const extras = this.mapper.getExtraSoundChannelTypes()
    this.apuChannelCount = channels.length
    return channels.concat(extras)
  }

  public getSoundVolume(channel: number): number {
    if (channel < this.apuChannelCount)
      return this.apu.getVolume(channel)
    return this.mapper.getSoundVolume(channel - this.apuChannelCount)
  }

  public getSoundFrequency(channel: number): number {
    if (channel < this.apuChannelCount)
      return this.apu.getFrequency(channel)
    return this.mapper.getSoundFrequency(channel - this.apuChannelCount)
  }

  public getSoundDutyRatio(channel: number): number {
    if (channel < this.apuChannelCount)
      return this.apu.getDutyRatio(channel)
    return this.mapper.getSoundDutyRatio(channel - this.apuChannelCount)
  }

  public render(pixels: Uint8Array|Uint8ClampedArray): void {
    this.ppu.render(pixels)
  }

  public renderNameTable1(pixels: Uint8ClampedArray, lineWidth: number,
                          startX: number, startY: number, page: number): void
  {
    this.ppu.renderNameTable1(pixels, lineWidth, startX, startY, page << 10)
  }

  public renderPatternTable(pixels: Uint8ClampedArray, lineWidth: number,
                            colorGroups: Uint8Array): void
  {
    this.ppu.renderPattern(pixels, lineWidth, colorGroups)
  }

  public setPrgBank(bank: number, page: number): void {
    this.prgBank[bank] = page << 13
  }

  public createMapper(mapperNo: number, prgSize: number, romHash?: string): Mapper {
    const mapperFunc = kMapperTable[mapperNo]
    return mapperFunc({
      bus: this.bus,
      cpu: this.cpu,
      ppu: this.ppu,
      prgBankCtrl: this,
      prgSize,
      romHash,
    })
  }

  public readFromApu(adr: Address): Byte {
    return this.apu.read(adr)
  }

  public writeToApu(adr: Address, value: Byte): void {
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
  }

  protected setMemoryMap(): void {
    const bus = this.bus
    bus.clearMemoryMap()

    bus.setReadMemory(0x2000, 0x3fff, (adr) => {  // PPU
      const reg = adr & 7
      return this.ppu.read(reg)
    })
    bus.setWriteMemory(0x2000, 0x3fff, (adr, value) => {  // PPU
      const reg = adr & 7
      this.ppu.write(reg, value)
    })

    bus.setReadMemory(0x4000, 0x5fff, (adr) => this.readFromApu(adr))  // APU
    bus.setWriteMemory(0x4000, 0x5fff, (adr, value) => this.writeToApu(adr, value))  // APU

    // PRG ROM
    const prgMask = (this.prgRom.length - 1) | 0
    this.prgBank = [0x0000,  // 0x8000~
                    0x2000,  // 0xa000~
                    -0x4000 & prgMask,  // 0xc000~
                    -0x2000 & prgMask]  // 0xe000~
    bus.setReadMemory(0x8000, 0xffff, (adr) => {
      adr = adr | 0
      const bank = (adr - 0x8000) >> 13
      const offset = (adr & ((1 << 13) - 1)) | 0
      return this.prgRom[((this.prgBank[bank] | 0) + offset) & prgMask] | 0
    })

    // RAM
    bus.setReadMemory(0x0000, 0x1fff, (adr) => this.ram[adr & (RAM_SIZE - 1)])
    bus.setWriteMemory(0x0000, 0x1fff, (adr, value) => { this.ram[adr & (RAM_SIZE - 1)] = value })
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
        this.ppu.setVBlank()
        this.vblankCallback((leftCycles / VCYCLE) | 0)
        break
      case VBLANK_NMI:
        this.interruptVBlank()
        break
      case VBLANK_END:
        this.ppu.clearVBlank()
        break
      case VRETURN:
        cycleCount2 -= (VRETURN * 341 / 3) | 0
        this.ppu.setHcount(0)
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
