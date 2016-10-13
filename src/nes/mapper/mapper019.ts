// Namco 163

import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export function mapper019(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
  const BANK_BIT = 13
  const BANK_SIZE = 1 << BANK_BIT
  const size = romData.length
  const count = size / BANK_SIZE
  const kLastBank = size - BANK_SIZE
  let prgBank0 = 0, prgBank1 = 0, prgBank2 = 0
  cpu.setReadMemory(0x8000, 0x9fff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank0])
  cpu.setReadMemory(0xa000, 0xbfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank1])
  cpu.setReadMemory(0xc000, 0xdfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank2])
  cpu.setReadMemory(0xe000, 0xffff, (adr) => romData[(adr & (BANK_SIZE - 1)) + kLastBank])

  // CHR ROM bank
  cpu.setWriteMemory(0x8000, 0xbfff, (adr, value) => {
    const bank = (adr >> 11) & 7
    ppu.setChrBankOffset(bank, value)
  })

  // PRG ROM bank
  cpu.setWriteMemory(0xe000, 0xffff, (adr, value) => {
    if (adr <= 0xe7ff) {
      prgBank0 = (value & (count - 1)) << BANK_BIT
    } else if (adr <= 0xefff) {
      prgBank1 = (value & (count - 1)) << BANK_BIT
    } else if (adr <= 0xf7ff) {
      prgBank2 = (value & (count - 1)) << BANK_BIT
    }
  })
}
