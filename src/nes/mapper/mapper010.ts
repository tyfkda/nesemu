// MMC4 (FxROM)

import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

export function mapper010(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
  const BANK_BIT = 14
  const BANK_SIZE = 1 << BANK_BIT
  const size = romData.length
  const count = size / BANK_SIZE
  const kLastBank = size - BANK_SIZE
  let prgBank = 0
  cpu.setReadMemory(0x8000, 0xbfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank])
  cpu.setReadMemory(0xc000, 0xffff,
                    (adr) => romData[(adr & (BANK_SIZE - 1)) + kLastBank])

  // PRG ROM bank
  cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
    if (adr < 0xb000)
      prgBank = (value & (count - 1)) << BANK_BIT
    else
      ppu.setChrBank(value)
  })
  // TODO: Implement latch to switch CHR bank.
  cpu.setWriteMemory(0xe000, 0xf000, (adr, value) => {
    if (adr >= 0xf000)
      ppu.setMirrorMode((value & 1) === 0 ? MirrorMode.VERT : MirrorMode.HORZ)
  })

  // PRG RAM
  const ram = new Uint8Array(0x2000)
  ram.fill(0xbf)
  cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
  cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
}
