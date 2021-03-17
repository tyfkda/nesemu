import Bus from '../bus'
import {Channel, WaveType} from '../apu'
import Cpu from '../cpu/cpu'
import Ppu from '../ppu/ppu'
import {Address, Byte} from '../types'

export interface PrgBankController {
  setPrgBank(bank: number, page: number): void
}

export interface MapperOptions {
  bus: Bus
  cpu: Cpu
  ppu: Ppu
  prgBankCtrl: PrgBankController
  prgSize: number
  romHash?: string
  writeToApu: (adr: Address, value: Byte) => void
  readFromApu: (adr: Address) => Byte
}

export class Mapper {
  public reset(): void {}

  public onHblank(_hcount: number): void {}

  public save(): object {
    return {}
  }

  public load(_saveData: any): void {}

  public getExtraChannelWaveTypes(): WaveType[]|null {
    return null
  }

  public getSoundChannel(_ch: number): Channel {
    throw new Error('Invalid call')
  }
}
