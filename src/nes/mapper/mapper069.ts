// Sunsoft FME-7

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

const kMirrorTable = [
  MirrorMode.VERT, MirrorMode.HORZ, MirrorMode.SINGLE0, MirrorMode.SINGLE1,
]

export class Mapper069 extends Mapper {
  public static create(pbc: PrgBankController, size: number, cpu: Cpu, ppu: Ppu): Mapper {
    return new Mapper069(pbc, size, cpu, ppu)
  }

  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super()

    // const BANK_BIT = 13
    // const count = prgSize >> BANK_BIT

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
      case 0x0a:
      case 0x0b:
        prgBankCtrl.setPrgBank(command - 9, value)
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
