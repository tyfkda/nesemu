// AxROM

import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'

const kMirrorTable = [MirrorMode.SINGLE0, MirrorMode.SINGLE1]

export class Mapper007 extends Mapper {
  public static create(options: MapperOptions): Mapper {
    return new Mapper007(options)
  }

  constructor(options: MapperOptions) {
    super(options)
    // 32KB switchable PRG ROM bank
    // const BANK_BIT = 15
    // const count = prgSize >> BANK_BIT

    // PRG ROM bank
    this.options.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      const bank = value << 2
      for (let i = 0; i < 4; ++i)
        this.options.setPrgBank(i, bank + i)

      const namePage = (value >> 4) & 1
      this.options.setMirrorMode(kMirrorTable[namePage])
    })
  }
}
