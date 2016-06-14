// Sunsoft-1 mapper

import {Cpu6502} from '../cpu.ts'
import {Ppu} from '../ppu.ts'

export function mapper184(romData: Uint8Array, cpu: Cpu6502, ppu: Ppu) {
  const BANK_BIT = 14
  const BANK_SIZE = 1 << BANK_BIT
  const size = romData.length
  const count = size / BANK_SIZE
  const kLastBank = size - BANK_SIZE
  let prgBank = 0
  cpu.setReadMemory(0x8000, 0xbfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank])
  cpu.setReadMemory(0xc000, 0xffff,
                    (adr) => romData[(adr & (BANK_SIZE - 1)) + kLastBank])

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
