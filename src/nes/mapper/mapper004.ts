// MMC3

import {IrqType} from '../cpu/cpu'
import {Mapper, MapperOptions} from './mapper'
import {MirrorMode, PpuReg, PpuMaskBit} from '../ppu/types'
import {Util} from '../../util/util'

export class Mapper004 extends Mapper {
  protected regs = new Uint8Array(8)
  protected maxPrg = 0
  protected bankSelect = 0
  protected irqHlineEnable = false
  protected irqHlineValue = -1
  protected irqHlineCounter = -1
  protected irqLatch = 0

  public static create(options: MapperOptions): Mapper {
    return new Mapper004(options)
  }

  constructor(options: MapperOptions) {
    super(options, 0x2000)

    const BANK_BIT = 13  // 0x2000
    this.maxPrg = (options.cartridge!.prgRom.byteLength >> BANK_BIT) - 1

    // Select
    this.options.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.bankSelect = value
        this.setPrgBank(this.bankSelect)
        this.setChrBank(this.bankSelect)
      } else {
        const reg = this.bankSelect & 0x07
        this.regs[reg] = value
        if (reg < 6)  // CHR
          this.setChrBank(this.bankSelect)
        else  // PRG
          this.setPrgBank(this.bankSelect)
      }
    })

    // Mirroring
    this.options.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.options.setMirrorMode((value & 1) === 0 ? MirrorMode.VERT : MirrorMode.HORZ)
      } else {
        // PRG RAM protect, TODO: Implement.
      }
    })

    // IRQ
    this.options.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.irqLatch = value
        this.setIrqHlineValue(this.irqLatch)
      } else {
        this.setIrqHlineValue(this.irqLatch)
      }
    })
    this.options.setWriteMemory(0xe000, 0xffff, (adr, _value) => {
      if ((adr & 1) === 0) {
        this.enableIrqHline(false)
        this.resetIrqHlineCounter()
      } else {
        this.enableIrqHline(true)
      }
    })

    // http://wiki.nesdev.com/w/index.php/INES#Flags_6
    // iNes header, flags 6
    // > Some mappers, such as MMC1, MMC3, and AxROM, can control nametable mirroring.
    // > They ignore bit 0
    let mirror = MirrorMode.VERT
    // Dirty hack: detect mirror mode from ROM hash.
    const romHash = this.options.cartridge!.calcHashValue()
    switch (romHash) {
    case '6c0cd447297e95e45db35a4373dbeae1':  // Babel no Tou
    case 'e791b12fc3419a2e2f8a5ed64b210d72':  // Dragon Spirit
    case '44c206c61ff37406815f21b922e105c7':  // Family Pinball
    case '98b3778d1e6045d2a3350eb7eb3b39fc':  // Genpei Touma Den
    case '1e377977f7e8c067dd7181271a467959':  // Valkyrie no Bouken
    case '002f464f224ccbed94427686815ab68b':  // Sanma no Mei Tantei
      mirror = MirrorMode.HORZ
      break
    default:
      break
    }
    this.options.setMirrorMode(mirror)  // Default vertical mirroring?

    this.reset()
  }

  public reset(): void {
    this.irqHlineEnable = false
    this.irqHlineValue = this.irqHlineCounter = -1

    this.options.prgBankCtrl.setPrgBank(3, this.maxPrg)

    this.bankSelect = 0
    this.setPrgBank(this.bankSelect)
  }

  public save(): object {
    return super.save({
      regs: Util.convertUint8ArrayToBase64String(this.regs),
      bankSelect: this.bankSelect,
      irqHlineEnable: this.irqHlineEnable,
      irqHlineValue: this.irqHlineValue,
      irqHlineCounter: this.irqHlineCounter,
      irqLatch: this.irqLatch,
    })
  }

  public load(saveData: any): void {
    super.load(saveData)
    this.regs = Util.convertBase64StringToUint8Array(saveData.regs)
    this.bankSelect = saveData.bankSelect
    this.irqHlineEnable = saveData.irqHlineEnable
    this.irqHlineValue = saveData.irqHlineValue
    this.irqHlineCounter = saveData.irqHlineCounter
    this.irqLatch = saveData.irqLatch

    this.setPrgBank(this.bankSelect)
    this.setChrBank(this.bankSelect)
  }

  public onHblank(hcount: number): void {
    // http://bobrost.com/nes/files/mmc3irqs.txt
    // Note: BGs OR sprites MUST be enabled in $2001 (bits 3 and 4)
    // in order for the countdown to occur.
    const regs = this.options.getPpuRegs()
    if ((regs[PpuReg.MASK] & (PpuMaskBit.SHOW_SPRITE | PpuMaskBit.SHOW_BG)) !== 0) {
      if (--this.irqHlineCounter === 0 && this.irqHlineEnable) {
        this.options.requestIrq(IrqType.EXTERNAL)
      }
    }

    switch (hcount) {
    case 0:
      this.irqHlineCounter = this.irqHlineValue
      break
    default:
      break
    }
  }

  protected setPrgBank(swap: number): void {
    if ((swap & 0x40) === 0) {
      this.options.setPrgBank(0, this.regs[6])
      this.options.setPrgBank(1, this.regs[7])
      this.options.setPrgBank(2, this.maxPrg - 1)
    } else {
      this.options.setPrgBank(2, this.regs[6])
      this.options.setPrgBank(1, this.regs[7])
      this.options.setPrgBank(0, this.maxPrg - 1)
    }
  }

  protected setChrBank(swap: number): void {
    if ((swap & 0x80) === 0) {
      this.options.setChrBankOffset(0, this.regs[0] & 0xfe)
      this.options.setChrBankOffset(1, this.regs[0] | 1)
      this.options.setChrBankOffset(2, this.regs[1] & 0xfe)
      this.options.setChrBankOffset(3, this.regs[1] | 1)
      this.options.setChrBankOffset(4, this.regs[2])
      this.options.setChrBankOffset(5, this.regs[3])
      this.options.setChrBankOffset(6, this.regs[4])
      this.options.setChrBankOffset(7, this.regs[5])
    } else {
      this.options.setChrBankOffset(4, this.regs[0] & 0xfe)
      this.options.setChrBankOffset(5, this.regs[0] | 1)
      this.options.setChrBankOffset(6, this.regs[1] & 0xfe)
      this.options.setChrBankOffset(7, this.regs[1] | 1)
      this.options.setChrBankOffset(0, this.regs[2])
      this.options.setChrBankOffset(1, this.regs[3])
      this.options.setChrBankOffset(2, this.regs[4])
      this.options.setChrBankOffset(3, this.regs[5])
    }
  }

  protected setIrqHlineValue(line: number): void {
    this.irqHlineValue = line
    this.irqHlineCounter = this.irqHlineValue
  }

  protected enableIrqHline(value: boolean): void {
    this.irqHlineEnable = value
  }

  protected resetIrqHlineCounter(): void {
    this.irqHlineCounter = 0
  }
}

export class Mapper088 extends Mapper004 {
  public static create(options: MapperOptions): Mapper {
    return new Mapper088(options)
  }

  constructor(protected options: MapperOptions) {
    super(options)

    // Select
    this.options.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.bankSelect = value & 0x07
        this.setPrgBank(this.bankSelect)
        this.setChrBank(this.bankSelect)
      } else {
        const reg = this.bankSelect & 0x07
        if (reg < 6) {  // CHR
          value &= 0x3f
          if (reg >= 2)
            value |= 0x40
          this.regs[reg] = value
          this.setChrBank(this.bankSelect)
        } else {  // PRG
          this.regs[reg] = value
          this.setPrgBank(this.bankSelect)
        }
      }
    })
  }
}

const kMirrorModeTable95 = [
  MirrorMode.SINGLE0, MirrorMode.REVERSE_HORZ,
  MirrorMode.HORZ, MirrorMode.SINGLE1,
]

export class Mapper095 extends Mapper004 {
  public static create(options: MapperOptions): Mapper {
    return new Mapper095(options)
  }

  constructor(protected options: MapperOptions) {
    super(options)

    // Select
    this.options.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.bankSelect = value & 7
      } else {
        const reg = this.bankSelect & 0x07
        if (reg < 6) {  // CHR
          this.regs[reg] = value & 0x3f
          this.setChrBank(0x00)

          if (reg === 0 || reg === 1) {
            const n1 = (this.regs[0] >> 5) & 1
            const n2 = (this.regs[1] >> 4) & 2
            this.options.setMirrorMode(kMirrorModeTable95[n2 | n1])
          }
        } else {  // PRG
          this.regs[reg] = value & 0x1f
          this.setPrgBank(0x00)
        }
      }
    })
  }
}

export class Mapper118 extends Mapper004 {
  public static create(options: MapperOptions): Mapper {
    return new Mapper118(options)
  }

  constructor(options: MapperOptions) {
    super(options)

    // Select
    this.options.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.bankSelect = value
        this.setPrgBank(this.bankSelect)
        this.setChrBank(this.bankSelect)
      } else {
        const reg = this.bankSelect & 0x07
        this.regs[reg] = value & 0x7f
        if (reg < 6) {  // CHR
          this.setChrBank(this.bankSelect)
        } else {  // PRG
          this.setPrgBank(this.bankSelect)
        }

        const chrA12 = this.regs[0] & 0x80
        const bank = this.regs[0] & 7
        if ((chrA12 === 0 && bank < 2) || (chrA12 !== 0 && bank >= 2 && bank < 6))
          this.options.setMirrorMode(
            (value & 0x80) === 0 ? MirrorMode.SINGLE0 : MirrorMode.SINGLE1)
      }
    })
  }
}
