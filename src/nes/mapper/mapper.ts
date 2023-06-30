import {Reader, Writer} from '../bus'
import {Channel, WaveType} from '../apu'
import {IrqType} from '../cpu/cpu'
import {MirrorMode} from '../ppu/types'
import {Address, Byte} from '../types'
import {Cartridge} from '../cartridge'
import {Util} from '../../util/util'

export interface MapperOptions {
  cartridge: Cartridge|null,
  // CPU
  setReadMemory(start: Address, end: Address, reader: Reader): void
  setWriteMemory(start: Address, end: Address, writer: Writer): void
  setPrgBank(bank: number, page: number): void
  requestIrq(type: IrqType): void
  clearIrqRequest(type: IrqType): void
  // PPU
  setChrBank(value: number): void
  setChrBankOffset(bank: number, value: number): void
  setMirrorMode(mode: MirrorMode): void
  setMirrorModeBit(bit: Byte): void
  getPpuRegs(): Readonly<Uint8Array>
  setChrData(chrData: Uint8Array): void
  writePpuDirect(addr: Address, value: Byte): void
  // APU
  writeToApu: (adr: Address, value: Byte) => void
  readFromApu: (adr: Address) => Byte
}

export class Mapper {
  protected sram: Uint8Array

  public reset(): void {}

  public onHblank(_hcount: number): void {}

  public getSram(): Uint8Array|null { return this.sram }

  public save(): object {
    return {}
  }

  public load(_saveData: any): void {}

  public saveSram(): object|null {
    if (this.sram == null)
      return null
    return { sram: Util.convertUint8ArrayToBase64String(this.sram) }
  }

  public loadSram(saveData: any): void {
    const sram = Util.convertBase64StringToUint8Array(saveData.sram)
    this.sram = sram
  }

  public getExtraChannelWaveTypes(): WaveType[]|null {
    return null
  }

  public getSoundChannel(_ch: number): Channel {
    throw new Error('Invalid call')
  }
}
