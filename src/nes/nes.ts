// NES: Nintendo Entertainment System

import {Apu, IChannel, GamePad, WaveType} from './apu'
import {Bus} from './bus'
import {ICartridge} from './cartridge'
import {Cpu, IrqType} from './cpu/cpu'
import {Ppu} from './ppu/ppu'
import {Address, Byte} from './types'
import {Util} from '../util/util'
import {CPU_HZ, VBlank} from './const'

import {Mapper} from './mapper/mapper'
import {kMapperTable} from './mapper/mapper_table'

const RAM_SIZE = 0x0800

const VCYCLE = (VBlank.VRETURN * 341 / 3) | 0

const OAMDMA = 0x4014

function getHblankCount(cpuCycle: number): number {
  return (cpuCycle * (3 / 341)) | 0
}

export const enum NesEvent {
  VBlank,
  PrgBankChange,
}

export interface NesOption {
  nmiFn?: () => void
  apuIrqFn?: () => void
}

export class Nes {
  protected ram = new Uint8Array(RAM_SIZE)
  protected bus: Bus
  protected cpu: Cpu
  protected ppu: Ppu
  protected apu: Apu
  protected cycleCount = 0

  private cartridge: ICartridge

  protected mapper: Mapper
  private prgRom = new Uint8Array(0)
  private eventCallback: (event: NesEvent, param?: any) => void
  private breakPointCallback: () => void
  private prgBank: number[] = []
  private apuChannelCount = 0
  private channelWaveTypes: WaveType[]
  private gamePads = [new GamePad(), new GamePad()]

  private peripheralMap = new Map<number, (adr: Address, value?: Byte) => any>()

  public static isMapperSupported(mapperNo: number): boolean {
    return mapperNo in kMapperTable
  }

  constructor(opt?: NesOption) {
    this.bus = new Bus()
    this.cpu = new Cpu(this.bus)
    this.ppu = new Ppu(opt?.nmiFn || this.cpu.requestNmi.bind(this.cpu))
    this.apu = new Apu(this.gamePads, opt?.apuIrqFn || (() => this.cpu.requestIrq(IrqType.APU)))
    this.eventCallback = (_e, _p) => {}
    this.breakPointCallback = () => {}

    const mapperNo = 0
    this.mapper = this.createMapper(mapperNo, null)
    this.channelWaveTypes = this.apu.getWaveTypes()
    this.apuChannelCount = this.channelWaveTypes.length
    this.setMemoryMap()
  }

  public getBus(): Bus { return this.bus }
  public getCpu(): Cpu { return this.cpu }
  public getPpu(): Ppu { return this.ppu }
  public getCycleCount(): number { return this.cycleCount }

  public setEventCallback(callback: (event: NesEvent, param?: any) => void): void {
    this.eventCallback = callback
  }

  public setBreakPointCallback(callback: () => void): void {
    this.breakPointCallback = callback
  }

  public setCartridge(cartridge: ICartridge): void {
    this.cartridge = cartridge

    this.prgRom = cartridge.prgRom
    this.ppu.setChrData(cartridge.chrRom)
    this.ppu.setMirrorMode(cartridge.mirrorMode)
    this.cpu.deleteAllBreakPoints()

    this.setMemoryMap()
    this.mapper = this.createMapper(cartridge.mapperNo, cartridge)

    this.addExtraSoundChannels(this.mapper.getExtraChannelWaveTypes())
  }

  public addExtraSoundChannels(extras: WaveType[]|null): void {
    let channels = this.apu.getWaveTypes()
    if (extras != null)
      channels = channels.concat(extras)
    this.channelWaveTypes = channels
  }

  public setPeripheral(ioMap: Map<number, (adr: Address, value?: Byte) => any>): void {
    for (const [adr, value] of ioMap) {
      console.assert(0x4000 <= adr && adr <= 0x5fff)
      this.peripheralMap.set(adr, value)
    }
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
    this.cpu.load(saveData.cpu)
    this.ppu.load(saveData.ppu)
    this.apu.load(saveData.apu)
    this.mapper.load(saveData.mapper)
    this.ram = Util.convertBase64StringToUint8Array(saveData.ram)
  }

  public saveSram(): object|null {
    return this.cartridge?.isBatteryOn ? this.mapper.saveSram() : null
  }

  public loadSram(saveData: any): void {
    if (this.cartridge?.isBatteryOn)
      this.mapper.loadSram(saveData)
  }

  public reset(): void {
    this.cpu.reset()
    this.ppu.reset()
    this.apu.reset()
    this.cycleCount = 0

    if (this.mapper != null)
      this.mapper.reset()
  }

  public setPadStatus(no: number, status: number): void {
    this.gamePads[no].setStatus(status)
  }

  public runMilliseconds(msec: number): number {
    let leftCycles = (msec * (CPU_HZ / 1000)) | 0
    try {
      const notPaused = !this.cpu.isPaused()
      do {
        const cycle = this.cpu.step()
        leftCycles -= cycle
        this.tryHblankEvent(cycle, leftCycles)
        if (notPaused && this.cpu.isPaused()) {  // Hit break point.
          this.breakPointCallback()
          return 0
        }
      } while (leftCycles > 0)
      return -leftCycles
    } catch (e) {
      this.cpu.pause(true)
      throw e
    }
  }

  public getChannelWaveTypes(): WaveType[] {
    return this.channelWaveTypes
  }

  public getSoundChannel(ch: number): IChannel {
    if (ch < this.apuChannelCount)
      return this.apu.getChannel(ch)
    return this.mapper.getSoundChannel(ch - this.apuChannelCount)
  }

  public render(pixels: Uint8Array | Uint8ClampedArray): void {
    this.ppu.render(pixels)
  }

  public createMapper(mapperNo: number, cartridge: ICartridge|null): Mapper {
    const mapperFunc = kMapperTable[mapperNo]
    return mapperFunc({
      cartridge,
      setReadMemory: this.bus.setReadMemory.bind(this.bus),
      setWriteMemory: this.bus.setWriteMemory.bind(this.bus),
      setPrgBank: (bank: number, page: number): void => {
        this.prgBank[bank] = page << 13
        this.eventCallback(NesEvent.PrgBankChange, (bank << 8) | page)
      },
      requestIrq: this.cpu.requestIrq.bind(this.cpu),
      clearIrqRequest: this.cpu.clearIrqRequest.bind(this.cpu),
      setChrBank: this.ppu.setChrBank.bind(this.ppu),
      setChrBankOffset: this.ppu.setChrBankOffset.bind(this.ppu),
      setMirrorMode: this.ppu.setMirrorMode.bind(this.ppu),
      setMirrorModeBit: this.ppu.setMirrorModeBit.bind(this.ppu),
      getPpuRegs: this.ppu.getRegs.bind(this.ppu),
      setChrData: this.ppu.setChrData.bind(this.ppu),
      writePpuDirect: this.ppu.writePpuDirect.bind(this.ppu),
      setPeripheral: this.setPeripheral.bind(this),
    })
  }

  protected readFromApu(adr: Address): Byte {
    return this.apu.read(adr)
  }

  protected writeToApu(adr: Address, value: Byte): void {
    switch (adr) {
    case OAMDMA:
      if (0 <= value && value <= 0x1f) {  // RAM
        this.ppu.copyWithDma(this.ram, value << 8)
        this.cpu.stall(513)
      } else if (0x60 <= value && value <= 0x7f) {
        const sram = this.mapper.getSram()
        if (sram != null) {
          this.ppu.copyWithDma(sram, (value - 0x60) << 8)
          this.cpu.stall(513)
        }
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

    bus.setReadMemory(0x2000, 0x3fff, adr => {  // PPU
      const reg = adr & 7
      return this.ppu.read(reg)
    })
    bus.setWriteMemory(0x2000, 0x3fff, (adr, value) => {  // PPU
      const reg = adr & 7
      this.ppu.write(reg, value)
    })

    bus.setReadMemory(0x4000, 0x5fff, adr => {
      let val = 0
      if (this.peripheralMap.has(adr))
        val = this.peripheralMap.get(adr)!(adr)
      val |= this.readFromApu(adr)  // APU
      return val
    })
    bus.setWriteMemory(0x4000, 0x5fff, (adr, value) => {
      if (this.peripheralMap.has(adr)) {
        this.peripheralMap.get(adr)!(adr, value)
      }
      this.writeToApu(adr, value)  // APU
    })

    // PRG ROM
    const prgMask = (this.prgRom.length - 1) | 0
    this.prgBank = [
      0x0000,             // 0x8000~
      0x2000,             // 0xa000~
      -0x4000 & prgMask,  // 0xc000~
      -0x2000 & prgMask,  // 0xe000~
    ]
    bus.setReadMemory(0x8000, 0xffff, adr => {
      adr = adr | 0
      const bank = (adr - 0x8000) >> 13
      const offset = (adr & ((1 << 13) - 1)) | 0
      return this.prgRom[((this.prgBank[bank] | 0) + offset) & prgMask] | 0
    })

    // RAM
    bus.setReadMemory(0x0000, 0x1fff, adr => this.ram[adr & (RAM_SIZE - 1)])
    bus.setWriteMemory(0x0000, 0x1fff, (adr, value) => { this.ram[adr & (RAM_SIZE - 1)] = value })
  }

  private tryHblankEvent(cycle: number, leftCycles: number): void {
    let nextCycleCount = this.cycleCount + cycle
    const prevHcount = getHblankCount(this.cycleCount)
    let hcount = getHblankCount(nextCycleCount)
    if (hcount > prevHcount) {
      if (hcount >= VBlank.VRETURN) {
        nextCycleCount -= VCYCLE
        hcount = 0
      }

      this.ppu.setHcount(hcount)
      this.apu.onHblank(hcount)
      this.mapper.onHblank(hcount)

      if (hcount === VBlank.NMI)
        this.eventCallback(NesEvent.VBlank, (leftCycles / VCYCLE) | 0)
    }
    this.cycleCount = nextCycleCount
  }
}
