import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export interface PrgBankController {
  setPrgBank(bank: number, page: number): void
}

export interface MapperOptions {
  cpu: Cpu
  ppu: Ppu,
  prgBankCtrl: PrgBankController
  prgSize: number
}

export class Mapper {
  public reset() {
  }

  public onHblank(hcount: number): void {
  }

  public save(): object {
    return null
  }

  public load(_saveData: any): void {
  }
}
