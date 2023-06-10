// MMC4 (FxROM)

import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'

export class Mapper010 extends Mapper {
  public static create(options: MapperOptions): Mapper {
    return new Mapper010(options)
  }

  constructor(private options: MapperOptions) {
    super()

    // const BANK_BIT = 14
    // const count = prgSize >> BANK_BIT

    // PRG ROM bank
    this.options.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if (adr < 0xb000) {
        const prgBank = value << 1
        this.options.setPrgBank(0, prgBank)
        this.options.setPrgBank(1, prgBank + 1)
      } else {
        this.options.setChrBank(value)
      }
    })
    // TODO: Implement latch to switch CHR bank.
    this.options.setWriteMemory(0xe000, 0xf000, (adr, value) => {
      if (adr >= 0xf000)
        this.options.setMirrorMode((value & 1) === 0 ? MirrorMode.VERT : MirrorMode.HORZ)
    })

    // PRG RAM
    this.sram = new Uint8Array(0x2000)
    this.sram.fill(0xbf)
    this.options.setReadMemory(0x6000, 0x7fff, adr => this.sram[adr & 0x1fff])
    this.options.setWriteMemory(0x6000, 0x7fff, (adr, value) => { this.sram[adr & 0x1fff] = value })
  }
}
