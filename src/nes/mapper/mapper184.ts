// Sunsoft-1 mapper

import {Cpu} from '../cpu.ts'
import {Ppu} from '../ppu.ts'

export function mapper184(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
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
