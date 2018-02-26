// AxROM

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

const kMirrorTable = [MirrorMode.SINGLE0, MirrorMode.SINGLE1]

export class Mapper007 extends Mapper {
  public static create(pbc: PrgBankController, size: number, cpu: Cpu, ppu: Ppu): Mapper {
    return new Mapper007(pbc, size, cpu, ppu)
  }

  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super()
    // 32KB switchable PRG ROM bank
    // const BANK_BIT = 15
    // const count = prgSize >> BANK_BIT

    // PRG ROM bank
    cpu.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      const bank = value << 2
      for (let i = 0; i < 4; ++i)
        prgBankCtrl.setPrgBank(i, bank + i)

      const namePage = (value >> 4) & 1
      ppu.setMirrorMode(kMirrorTable[namePage])
    })
  }
}
