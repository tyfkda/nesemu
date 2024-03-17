// MMC1

import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'

const kMirrorTable = [
  MirrorMode.SINGLE0,
  MirrorMode.SINGLE1,
  MirrorMode.VERT,
  MirrorMode.HORZ,
]

export class Mapper001 extends Mapper {
  private maxPrg = 0
  private register = 0
  private counter = 0
  private prgBankMode = 3
  private prgReg = 0
  private chrBank4k = true
  private chrBank = [0 << 2, 1 << 2]

  public static create(options: MapperOptions): Mapper {
    return new Mapper001(options)
  }

  constructor(options: MapperOptions) {
    super(options, 0x2000)

    const BANK_BIT = 14  // 16KB
    this.maxPrg = (options.cartridge!.prgRom.byteLength >> BANK_BIT) - 1

    // Serial: 5bits.
    this.options.setWriteMemory(0x8000, 0xffff, (adr, value) => {
      if ((value & 0x80) !== 0) {  // Reset
        this.resetRegister()
        return
      }

      this.register |= (value & 1) << this.counter
      if (++this.counter < 5)
        return

      // Register filled: branch according to bit 13~14.
      switch (adr & 0xe000) {
      case 0x8000:  // Control
        {
          this.options.setMirrorMode(kMirrorTable[this.register & 3])

          this.prgBankMode = (this.register >> 2) & 3
          this.setPrgBank(this.prgReg, this.chrBank[0])

          const newChrBank4k = (this.register & 0x10) !== 0
          if (this.chrBank4k !== newChrBank4k) {
            this.chrBank4k = newChrBank4k
            this.setChrBank(0, this.chrBank[0])
            this.setChrBank(1, this.chrBank[1])
          }
        }
        break
      case 0xa000:  // CHR bank 0
        {
          const bank = this.register
          if (this.chrBank[0] !== bank)
            this.setChrBank(0, bank)
          this.setPrgBank(this.prgReg, bank)
        }
        break
      case 0xc000:  // CHR bank 1
        {
          const bank = this.register
          if (this.chrBank[1] !== bank)
            this.setChrBank(1, bank)
        }
        break
      case 0xe000:  // PRG bank
        this.setPrgBank(this.register, this.chrBank[0])
        break
      default:
        break
      }
      this.resetRegister()
    })

    this.reset()
  }

  public reset(): void {
    this.setPrgBank(0, 0xff)
  }

  public save(): object {
    return super.save({
      register: this.register,
      counter: this.counter,
      prgBankMode: this.prgBankMode,
      prgReg: this.prgReg,
      chrBank4k: this.chrBank4k,
      chrBank: this.chrBank,
    })
  }

  public load(saveData: any): void {
    super.load(saveData)
    this.register = saveData.register
    this.counter = saveData.counter
    this.prgBankMode = saveData.prgBankMode
    this.chrBank4k = saveData.chrBank4k

    for (let i = 0; i < 2; ++i)
      this.setChrBank(i, saveData.chrBank[i])
    this.setPrgBank(saveData.prgReg, this.chrBank[0])
  }

  private resetRegister(): void {
    this.register = 0
    this.counter = 0
  }

  private setChrBank(hilo: number, bank: number): void {
    if (this.chrBank4k) {
      const chr = hilo << 2
      const b = bank << 2
      for (let i = 0; i < 4; ++i)
        this.options.setChrBankOffset(chr + i, b + i)
    } else {
      if (hilo === 0)
        this.options.setChrBank(bank >> 1)
    }
    this.chrBank[hilo] = bank
  }

  private setPrgBank(reg: number, chrBank0: number): void {
    this.prgReg = reg
    const highBit = chrBank0 & (0x10 & this.maxPrg)
    const bank = ((reg & 0x0f) | highBit) & this.maxPrg
    let p0, p1
    switch (this.prgBankMode) {
    case 0: case 1:
      p0 = bank & ~1
      p1 = bank | 1
      break
    case 2:
      p0 = 0
      p1 = bank
      break
    case 3:
      p0 = bank
      p1 = (this.maxPrg & 0x0f) | highBit
      break
    default:
      return
    }
    this.options.setPrgBank(0, p0 << 1)
    this.options.setPrgBank(1, (p0 << 1) + 1)
    this.options.setPrgBank(2, p1 << 1)
    this.options.setPrgBank(3, (p1 << 1) + 1)
  }
}
