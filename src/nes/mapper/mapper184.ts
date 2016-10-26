// Sunsoft-1 mapper

import {Mapper} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export class Mapper184 extends Mapper {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super()

    const mask = romData.length - 1
    cpu.setReadMemory(0x8000, 0xffff, (adr) => romData[adr & mask])

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
