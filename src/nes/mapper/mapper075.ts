// VRC1

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

export class Mapper075 extends Mapper {
  public static create(pbc: PrgBankController, size: number, cpu: Cpu, ppu: Ppu): Mapper {
    return new Mapper075(pbc, size, cpu, ppu)
  }

  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super()

    const BANK_BIT = 13
    const count = prgSize >> BANK_BIT
    for (let i = 0; i < 4; ++i)
      prgBankCtrl.setPrgBank(i, count - 1)

    const chrBank = [0, 0]
    const setChrBank = (bank, value) => {
      chrBank[bank] = value
      const b = bank << 2
      const ofs = value << 2
      for (let i = 0; i < 4; ++i)
        ppu.setChrBankOffset(b + i, ofs + i)
    }

    // PRG ROM bank
    cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (adr < 0x9000)
        prgBankCtrl.setPrgBank(0, value)
      else {
        ppu.setMirrorMode((value & 1) === 0 ? MirrorMode.VERT : MirrorMode.HORZ)
        setChrBank(0, (chrBank[0] & 0x0f) | ((value & 2) << 3))
        setChrBank(1, (chrBank[1] & 0x0f) | ((value & 4) << 2))
      }
    })
    cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if (adr < 0xb000)
        prgBankCtrl.setPrgBank(1, value)
    })
    cpu.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if (adr < 0xd000)
        prgBankCtrl.setPrgBank(2, value)
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
