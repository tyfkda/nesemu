// GxROM

import {Mapper, MapperOptions} from './mapper'

export class Mapper066 extends Mapper {
  private prgPage = 0
  private chrBank = 0

  public static create(options: MapperOptions): Mapper {
    return new Mapper066(options)
  }

  constructor(private options: MapperOptions) {
    super()

    // PRG ROM bank
    this.options.bus.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      this.setPrgBank((value >> 4) & 0x03)
      this.setChrBank(value & 0x03)
    })

    this.reset()
  }

  public reset() {
    //const BANK_BIT = 15
    //const BANK_SIZE = 1 << BANK_BIT
    //const size = this.options.prgSize
    this.setPrgBank(0)
  }

  public save(): object {
    return {
      prgPage: this.prgPage,
      chrBank: this.chrBank,
    }
  }

  public load(saveData: any): void {
    this.setPrgBank(saveData.prgPage)
    this.setChrBank(saveData.chrBank)
  }

  private setPrgBank(page: number): void {
    this.prgPage = page
    page <<= 2
    this.options.prgBankCtrl.setPrgBank(0, page)
    this.options.prgBankCtrl.setPrgBank(1, page + 1)
    this.options.prgBankCtrl.setPrgBank(2, page + 2)
    this.options.prgBankCtrl.setPrgBank(3, page + 3)
  }

  private setChrBank(bank: number): void {
    this.chrBank = bank
    this.options.ppu.setChrBank(bank)
  }
}
