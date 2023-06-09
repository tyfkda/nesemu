// UxROM

import {Mapper, MapperOptions} from './mapper'

class Mapper002Base extends Mapper {
  private bank = 0

  constructor(prgBankShift: number, private options: MapperOptions) {
    super()

    const BANK_BIT = 14
    const count = options.cartridge!.prgRom.byteLength >> BANK_BIT
    this.options.setPrgBank(0, 0)
    this.options.setPrgBank(1, 1)
    this.options.setPrgBank(2, count * 2 - 2)
    this.options.setPrgBank(3, count * 2 - 1)

    // PRG ROM bank
    this.options.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      const bank = (value >> prgBankShift) << 1
      this.setBank(bank)
    })

    const ramSize = options.cartridge!.ramSize()
    if (ramSize > 0) {
      this.sram = new Uint8Array(ramSize)  // TODO: SRAM or not.
      this.sram.fill(0xbf)
      this.options.setReadMemory(0x6000, 0x7fff, adr => this.sram[adr & 0x1fff])
      this.options.setWriteMemory(0x6000, 0x7fff,
                                  (adr, value) => { this.sram[adr & 0x1fff] = value })
    }
  }

  public save(): object {
    return {
      bank: this.bank,
    }
  }

  public load(saveData: any): void {
    this.setBank(saveData.bank)
  }

  private setBank(bank: number): void {
    this.bank = bank
    this.options.setPrgBank(0, bank)
    this.options.setPrgBank(1, bank + 1)
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
