// UxROM

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

class Mapper002Base extends Mapper {
  constructor(prgBankShift: number, prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu,
              _ppu: Ppu)
  {
    super()

    const BANK_BIT = 14
    const count = prgSize >> BANK_BIT
    prgBankCtrl.setPrgBank(0, 0)
    prgBankCtrl.setPrgBank(1, 1)
    prgBankCtrl.setPrgBank(2, count * 2 - 2)
    prgBankCtrl.setPrgBank(3, count * 2 - 1)

    // PRG ROM bank
    cpu.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      const bank = (value >> prgBankShift) << 1
      prgBankCtrl.setPrgBank(0, bank)
      prgBankCtrl.setPrgBank(1, bank + 1)
    })
  }
}

export class Mapper002 extends Mapper002Base {
  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super(0, prgBankCtrl, prgSize, cpu, ppu)
  }
}

// INES Mapper 093: Sunsoft-2 IC
// http://wiki.nesdev.com/w/index.php/INES_Mapper_093
// This mapper is deprecated for new development. Homebrew projects other than mapper tests should
// use UxROM (iNES Mapper 002) instead.
export class Mapper093 extends Mapper002Base {
  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super(4, prgBankCtrl, prgSize, cpu, ppu)
  }
}
