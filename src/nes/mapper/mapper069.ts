// Sunsoft FME-7

import {Mapper} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

const kMirrorTable = [
  MirrorMode.VERT, MirrorMode.HORZ, MirrorMode.SINGLE0, MirrorMode.SINGLE1,
]

export class Mapper069 extends Mapper {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super()

    const BANK_BIT = 13
    const BANK_SIZE = 1 << BANK_BIT
    const size = romData.length
    const count = size / BANK_SIZE
    const kLastBank = size - BANK_SIZE
    let prgBank1 = 0, prgBank2 = 0, prgBank3 = 0
    cpu.setReadMemory(0x8000, 0x9fff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank1])
    cpu.setReadMemory(0xa000, 0xbfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank2])
    cpu.setReadMemory(0xc000, 0xdfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank3])
    cpu.setReadMemory(0xe000, 0xffff, (adr) => romData[(adr & (BANK_SIZE - 1)) + kLastBank])

    // CHR ROM bank
    let command = 0
    cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      command = value & 0x0f
    })
    cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      switch (command) {
      case 0x00: case 0x01: case 0x02: case 0x03:
      case 0x04: case 0x05: case 0x06: case 0x07:
        ppu.setChrBankOffset(command, value)
        break
      case 0x09:
        prgBank1 = (value & (count - 1)) << BANK_BIT
        break
      case 0x0a:
        prgBank2 = (value & (count - 1)) << BANK_BIT
        break
      case 0x0b:
        prgBank3 = (value & (count - 1)) << BANK_BIT
        break
      case 0x0c:
        {
          ppu.setMirrorMode(kMirrorTable[value & 3])
        }
        break
      }
    })

    // PRG RAM
    const ram = new Uint8Array(0x2000)
    ram.fill(0xbf)
    cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
    cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
  }
}
