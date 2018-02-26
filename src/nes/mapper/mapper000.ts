import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export class Mapper000 extends Mapper {
  public static create(_pbc: PrgBankController, _size: number, _cpu: Cpu, _ppu: Ppu): Mapper {
    return new Mapper000()
  }

  // No special handling needed.
}
