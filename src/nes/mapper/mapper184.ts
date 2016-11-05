// Sunsoft-1 mapper

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export class Mapper184 extends Mapper {
  constructor(_prgBankCtrl: PrgBankController, _prgSize: number, cpu: Cpu, ppu: Ppu) {
    super()

    // CHR ROM bank
    cpu.setWriteMemory(0x6000, 0x7fff, (_adr, value) => {
      const hi = ((value >> (4 - 2)) & (7 << 2)) + (4 << 2)
      const lo = (value & 7) << 2
      for (let i = 0; i < 4; ++i)
        ppu.setChrBankOffset(i + 4, hi + i)
      for (let i = 0; i < 4; ++i)
        ppu.setChrBankOffset(i, lo + i)
    })
  }
}
