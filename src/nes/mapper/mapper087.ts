import {Mapper, MapperOptions} from './mapper'

export class Mapper087 extends Mapper {
  public static create(options: MapperOptions): Mapper {
    return new Mapper087(options)
  }

  constructor(private options: MapperOptions) {
    super()

    // PRG ROM bank
    this.options.bus.setWriteMemory(0x6000, 0x7fff, (_adr, value) => {
      const bank = ((value & 2) >> 1) | ((value & 1) << 1)
      this.options.ppu.setChrBank(bank)
    })
  }
}
