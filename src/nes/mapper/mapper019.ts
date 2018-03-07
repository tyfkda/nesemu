// Namco 163

import {Mapper, MapperOptions} from './mapper'

export class Mapper019 extends Mapper {
  public static create(options: MapperOptions): Mapper {
    return new Mapper019(options)
  }

  constructor(private options: MapperOptions) {
    super()

    // const BANK_BIT = 13
    // const count = prgSize >> BANK_BIT

    // CHR ROM bank
    this.options.bus.setWriteMemory(0x8000, 0xbfff, (adr, value) => {
      const bank = (adr >> 11) & 7
      this.options.ppu.setChrBankOffset(bank, value)
    })

    // PRG ROM bank
    this.options.bus.setWriteMemory(0xe000, 0xffff, (adr, value) => {
      if (adr <= 0xf7ff) {
        const bank = (adr - 0xe000) / 0x800
        this.options.prgBankCtrl.setPrgBank(bank, value)
      }
    })
  }
}
