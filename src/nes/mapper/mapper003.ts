import {Mapper, MapperOptions} from './mapper'

export class Mapper003 extends Mapper {
  private chrBank = 0

  public static create(options: MapperOptions): Mapper {
    return new Mapper003(options)
  }

  constructor(private options: MapperOptions) {
    super()

    // Chr ROM bank
    this.options.bus.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      this.chrBank = value
      this.options.ppu.setChrBank(this.chrBank)
    })
  }

  public save(): object {
    return {
      chrBank: this.chrBank,
    }
  }

  public load(saveData: any): void {
    this.chrBank = saveData.chrBank
    this.options.ppu.setChrBank(this.chrBank)
  }
}

export class Mapper185 extends Mapper003  {
  public static create(options: MapperOptions): Mapper {
    return new Mapper185(options)
  }

  constructor(options: MapperOptions) {
    super(options)
    options.ppu.writePpuDirect(0x0000, 1)  // For "Mighty bomb jack(J)"
  }
}
