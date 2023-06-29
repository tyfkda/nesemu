// Famicom Disk System

import {FdsMapper, RAM_SIZE} from './fds_mapper'
import {Nes} from '../nes'
import {ICartridge} from '../cartridge'
import {Address, Byte} from '../types'
import {Peripheral} from '../peripheral/keyboard'
import {MirrorMode} from '../ppu/types'

const dummyU8a = new Uint8Array()

class FdsDummyCartridge implements ICartridge {
  public get mapperNo(): number { return 20 }
  public get prgRom(): Uint8Array { return dummyU8a }
  public get chrRom(): Uint8Array { return dummyU8a }

  public get mirrorMode(): MirrorMode { return MirrorMode.HORZ }

  public get isBatteryOn(): boolean { return true }

  public calcHashValue(): string { return '' }

  public ramSize(): number { return RAM_SIZE }
}

export class Fds implements Peripheral {
  private mapper: FdsMapper
  private ioMap = new Map<number, (adr: Address, value?: Byte) => any>()
  private cartridge: FdsDummyCartridge

  constructor(biosData: Uint8Array, private nes: Nes) {
    this.cartridge = new FdsDummyCartridge()

    const bus = this.nes.getBus()
    const cpu = this.nes.getCpu()
    const ppu = this.nes.getPpu()
    this.mapper = new FdsMapper(biosData, {
      cartridge: this.cartridge,
      setReadMemory: bus.setReadMemory.bind(bus),
      setWriteMemory: bus.setWriteMemory.bind(bus),
      setPrgBank: (_bank: number, _page: number): void => { /* Dummy */ },
      requestIrq: cpu.requestIrq.bind(cpu),
      clearIrqRequest: cpu.clearIrqRequest.bind(cpu),
      setChrBank: ppu.setChrBank.bind(ppu),
      setChrBankOffset: ppu.setChrBankOffset.bind(ppu),
      setMirrorMode: ppu.setMirrorMode.bind(ppu),
      setMirrorModeBit: ppu.setMirrorModeBit.bind(ppu),
      getPpuRegs: ppu.getRegs.bind(ppu),
      setChrData: ppu.setChrData.bind(ppu),
      writePpuDirect: ppu.writePpuDirect.bind(ppu),
      setPeripheral: this.nes.setPeripheral.bind(this.nes),
    })
    this.nes.setMapper(this.mapper)

    {
      const readFn = (adr: number, value?: Byte): any => {
        if (value == null)
          return this.mapper.readDiskReg(adr)
      }
      const writeFn = (adr: number, value?: Byte): any => {
        if (value != null)
          return this.mapper.writeDiskReg(adr, value)
      }
      for (let adr = 0x4020; adr <= 0x402f; ++adr)
        this.ioMap.set(adr, writeFn)
      for (let adr = 0x4030; adr <= 0x403f; ++adr)
        this.ioMap.set(adr, readFn)

      const audioFn = (adr: number, value?: Byte): any => {
        if (value != null)
          this.mapper.writeAudio(adr, value)
        else
          return this.mapper.readAudio(adr)
      }
      for (let adr = 0x4040; adr <= 0x4097; ++adr)
        this.ioMap.set(adr, audioFn)
    }

    this.nes.addExtraSoundChannels(this.mapper.getExtraChannelWaveTypes())

    this.nes.setPeripheral(this.getIoMap())
  }

  public getCartridge(): ICartridge { return this.cartridge }

  public setImage(image: Uint8Array): boolean {
    this.mapper.setImage(image)
    return true
  }

  public getSideCount(): number {
    return this.mapper.getSideCount()
  }

  public eject(): void {
    this.mapper.eject()
  }

  public setSide(side: number): void {
    this.mapper.setSide(side)
  }

  public getIoMap(): Map<number, (adr: number, value?: Byte) => any> { return this.ioMap }
}
