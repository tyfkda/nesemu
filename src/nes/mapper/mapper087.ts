import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export class Mapper087 extends Mapper {
  public static create(pbc: PrgBankController, size: number, cpu: Cpu, ppu: Ppu): Mapper {
    return new Mapper087(pbc, size, cpu, ppu)
  }

  constructor(_prgBankCtrl: PrgBankController, _prgSize: number, cpu: Cpu, ppu: Ppu) {
    super()

    // PRG ROM bank
    cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => {
      const bank = ((value & 2) >> 1) | ((value & 1) << 1)
      ppu.setChrBank(bank)
    })
  }
}
