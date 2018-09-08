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

  public onHblank(hcount: number): void {
  }

  public save(): object {
    return {}
  }

  public load(_saveData: any): void {
  }

  public getExtraSoundChannelTypes(): ChannelType[] {
    return []
  }

  public getSoundVolume(channel: number): number {
    return 0
  }

  public getSoundFrequency(channel: number): number {
    return 0
  }
}
