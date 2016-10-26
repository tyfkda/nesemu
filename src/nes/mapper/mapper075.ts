// VRC1

import {Mapper} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

export class Mapper075 extends Mapper {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super()

    const BANK_BIT = 13
    const BANK_SIZE = 1 << BANK_BIT
    const size = romData.length
    const count = size / BANK_SIZE
    const kLastBank = size - BANK_SIZE
    const prgBank = [kLastBank, kLastBank, kLastBank, kLastBank]

    const chrBank = [0, 0]
    const setChrBank = (bank, value) => {
      chrBank[bank] = value
      const b = bank << 2
      const ofs = value << 2
      for (let i = 0; i < 4; ++i)
        ppu.setChrBankOffset(b + i, ofs + i)
    }

    cpu.setReadMemory(0x8000, 0xffff,
                      (adr) => {
                        const bank = (adr >> 13) & 3
                        return romData[(adr & (BANK_SIZE - 1)) + prgBank[bank]]
                      })

    // PRG ROM bank
    cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (adr < 0x9000)
        prgBank[0] = (value & (count - 1)) << BANK_BIT
      else {
        ppu.setMirrorMode((value & 1) === 0 ? MirrorMode.VERT : MirrorMode.HORZ)
        setChrBank(0, (chrBank[0] & 0x0f) | ((value & 2) << 3))
        setChrBank(1, (chrBank[1] & 0x0f) | ((value & 4) << 2))
      }
    })
    cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if (adr < 0xb000)
        prgBank[1] = (value & (count - 1)) << BANK_BIT
    })
    cpu.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if (adr < 0xd000)
        prgBank[2] = (value & (count - 1)) << BANK_BIT
    })

    // CHR ROM bank
    cpu.setWriteMemory(0xe000, 0xffff, (adr, value) => {
      const bank = (adr >> 12) & 1
      setChrBank(bank, (chrBank[bank] & 0x10) | (value & 0x0f))
    })

    // PRG RAM
    const ram = new Uint8Array(0x2000)
    ram.fill(0xbf)
    cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
    cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
  }
}
