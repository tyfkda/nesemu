// Namco 163

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export class Mapper019 extends Mapper {
  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super()

    // const BANK_BIT = 13
    // const count = prgSize >> BANK_BIT

    // CHR ROM bank
    cpu.setWriteMemory(0x8000, 0xbfff, (adr, value) => {
      const bank = (adr >> 11) & 7
      ppu.setChrBankOffset(bank, value)
    })

    // PRG ROM bank
    cpu.setWriteMemory(0xe000, 0xffff, (adr, value) => {
      if (adr <= 0xf7ff) {
        const bank = (adr - 0xe000) / 0x800
        prgBankCtrl.setPrgBank(bank, value)
      }
    })
  }
}
