// AxROM

import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'

const kMirrorTable = [MirrorMode.SINGLE0, MirrorMode.SINGLE1]

export class Mapper007 extends Mapper {
  public static create(options: MapperOptions): Mapper {
    return new Mapper007(options)
  }

  constructor(private options: MapperOptions) {
    super()
    // 32KB switchable PRG ROM bank
    // const BANK_BIT = 15
    // const count = prgSize >> BANK_BIT

    // PRG ROM bank
    this.options.bus.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      const bank = value << 2
      for (let i = 0; i < 4; ++i)
        this.options.prgBankCtrl.setPrgBank(i, bank + i)

      const namePage = (value >> 4) & 1
      this.options.ppu.setMirrorMode(kMirrorTable[namePage])
    })
  }
}
