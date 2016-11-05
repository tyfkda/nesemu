// MMC4 (FxROM)

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

export class Mapper010 extends Mapper {
  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super()

    const BANK_BIT = 14
    const count = prgSize >> BANK_BIT

    // PRG ROM bank
    cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if (adr < 0xb000) {
        const prgBank = value << 1
        prgBankCtrl.setPrgBank(0, prgBank)
        prgBankCtrl.setPrgBank(1, prgBank + 1)
      } else {
        ppu.setChrBank(value)
      }
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
}
