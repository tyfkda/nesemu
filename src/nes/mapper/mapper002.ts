// UxROM

import {Mapper, MapperOptions} from './mapper'

class Mapper002Base extends Mapper {
  private bank = 0

  constructor(prgBankShift: number, private options: MapperOptions) {
    super()

    const BANK_BIT = 14
    const count = options.prgSize >> BANK_BIT
    this.options.prgBankCtrl.setPrgBank(0, 0)
    this.options.prgBankCtrl.setPrgBank(1, 1)
    this.options.prgBankCtrl.setPrgBank(2, count * 2 - 2)
    this.options.prgBankCtrl.setPrgBank(3, count * 2 - 1)

    // PRG ROM bank
    this.options.bus.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      const bank = (value >> prgBankShift) << 1
      this.setBank(bank)
    })
  }

  public save(): object {
    return {
      bank: this.bank,
    }
  }

  public load(saveData: any): void {
    this.setBank(saveData.bank)
  }

  private setBank(bank: number) {
    this.bank = bank
    this.options.prgBankCtrl.setPrgBank(0, bank)
    this.options.prgBankCtrl.setPrgBank(1, bank + 1)
  }
}

export class Mapper002 extends Mapper002Base {
  public static create(options: MapperOptions): Mapper {
    return new Mapper002(options)
  }

  constructor(options: MapperOptions) {
    super(0, options)
  }
}

// INES Mapper 093: Sunsoft-2 IC
// http://wiki.nesdev.com/w/index.php/INES_Mapper_093
// This mapper is deprecated for new development. Homebrew projects other than mapper tests should
// use UxROM (iNES Mapper 002) instead.
export class Mapper093 extends Mapper002Base {
  public static create(options: MapperOptions): Mapper {
    return new Mapper093(options)
  }

  constructor(options: MapperOptions) {
    super(4, options)
  }
}
