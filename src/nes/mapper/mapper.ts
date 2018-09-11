import {Bus} from '../bus'
import {ChannelType} from '../apu'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export interface PrgBankController {
  setPrgBank(bank: number, page: number): void
}

export interface MapperOptions {
  bus: Bus,
  cpu: Cpu
  ppu: Ppu,
  prgBankCtrl: PrgBankController
  prgSize: number
  romHash?: string
}

export class Mapper {
  public reset() {
  }

  public onHblank(_hcount: number): void {
  }

  public save(): object {
    return {}
  }

  public load(_saveData: any): void {
  }

  public getExtraSoundChannelTypes(): ChannelType[] {
    return []
  }

  public getSoundVolume(_channel: number): number {
    return 0
  }

  public getSoundFrequency(_channel: number): number {
    return 0
  }
}
