// VRC3
// http://wiki.nesdev.com/w/index.php/VRC3

import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export function mapper073(romData: Uint8Array, cpu: Cpu, _ppu: Ppu) {
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
  cpu.setWriteMemory(0xf000, 0xffff, (_adr, value) => {
    prgBank = (value & (count - 1)) << BANK_BIT
  })

  // PRG RAM
  const ram = new Uint8Array(0x2000)
  ram.fill(0xff)
  cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
  cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
}
