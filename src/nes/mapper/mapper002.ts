// UxROM

import {Mapper} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

class Mapper002Base extends Mapper {
  constructor(prgBankShift: number, romData: Uint8Array, cpu: Cpu, _ppu: Ppu) {
    super()

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
    cpu.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      prgBank = ((value >> prgBankShift) & (count - 1)) << BANK_BIT
    })
  }
}

export class Mapper002 extends Mapper002Base {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super(0, romData, cpu, ppu)
  }
}

// INES Mapper 093: Sunsoft-2 IC
// http://wiki.nesdev.com/w/index.php/INES_Mapper_093
// This mapper is deprecated for new development. Homebrew projects other than mapper tests should
// use UxROM (iNES Mapper 002) instead.
export class Mapper093 extends Mapper002Base {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super(4, romData, cpu, ppu)
  }
}
