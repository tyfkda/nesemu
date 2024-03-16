// VRC4e
// http://wiki.nesdev.com/w/index.php/INES_Mapper_023

import {IrqType} from '../cpu/cpu'
import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'

const IRQ_ENABLE_AFTER = 1 << 0
const IRQ_ENABLE = 1 << 1
const IRQ_MODE = 1 << 2

const kMirrorTable = [MirrorMode.VERT, MirrorMode.HORZ, MirrorMode.SINGLE0, MirrorMode.SINGLE1]

class Mapper023Base extends Mapper {
  private prgBankMode = 0
  private prgBank = new Array<number>(4)
  private chrBank = new Array<number>(8)
  private irqControl = 0
  private irqLatch = 0
  private irqCounter = 0

  constructor(options: MapperOptions, mapping: Record<number, number>) {
    super(options, 0x2000)

    const BANK_BIT = 13
    const prgCount = options.cartridge!.prgRom.byteLength >> BANK_BIT

    this.setPrgBank(0, 0)
    this.setPrgBank(1, 1)
    this.setPrgBank(2, prgCount - 2)
    this.setPrgBank(3, prgCount - 1)

    // PRG ROM bank
    this.options.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (0x8000 <= adr && adr <= 0x8006) {
        switch (this.prgBankMode) {
        case 0:
          this.setPrgBank(0, value)
          break
        case 1:
          this.setPrgBank(2, value)
          break
        }
      } else if ((adr & 0xff00) === 0x9000) {
        const reg = mapping[adr & 0xff]
        if (reg === 0 || reg === 2) {  // Mirroring Control.
          const mirrorMode = value & 3
          this.options.setMirrorMode(kMirrorTable[mirrorMode])
        } else if (reg === 4 || reg === 6) {  // PRG Swap Mode control.
          this.prgBankMode = (value >> 1) & 1
          switch (this.prgBankMode) {
          case 0:
            this.setPrgBank(2, prgCount - 2)
            break
          case 1:
            this.setPrgBank(0, prgCount - 2)
            break
          }
        }
      }
    })
    this.options.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if (0xa000 <= adr && adr <= 0xa006) {
        this.setPrgBank(1, value & (prgCount - 1))
      } else if ((adr & 0xff00) === 0xb000) {
        const reg = mapping[adr & 0xff]
        if (reg === 0) {  // CHR Select 0
          this.setChrBankOffset(0, (this.chrBank[0] & ~0x0f) | (value & 0x0f))
        } else if (reg === 2) {
          this.setChrBankOffset(0, (this.chrBank[0] & ~0x1f0) | ((value & 0x1f) << 4))
        } else if (reg === 4) {  // CHR Select 1
          this.setChrBankOffset(1, (this.chrBank[1] & ~0x0f) | (value & 0x0f))
        } else if (reg === 6) {
          this.setChrBankOffset(1, (this.chrBank[1] & ~0x1f0) | ((value & 0x1f) << 4))
        }
      }
    })
    this.options.setWriteMemory(0xc000, 0xffff, (adr, value) => {
      if (0xc000 <= adr && adr <= 0xefff) {  // CHR Select 2...7
        const reg = mapping[adr & 0xff]
        let ofs = 0, hi = false
        switch (reg) {
        case 0:
          ofs = 0
          break
        case 2:
          ofs = 0
          hi = true
          break
        case 4:
          ofs = 1
          break
        case 6:
          ofs = 1
          hi = true
          break
        default:
          return
        }
        const bank = ((adr & 0x3000) >> 11) + 2 + ofs
        let newValue: number
        if (hi)
          newValue = (this.chrBank[bank] & ~0x1f0) | ((value & 0x1f) << 4)
        else
          newValue = (this.chrBank[bank] & ~0x0f) | (value & 0x0f)
        this.setChrBankOffset(bank, newValue)
      } else {  // IRQ
        const reg = mapping[adr & 0xff]
        switch (reg) {
        case 0:  // IRQ Latch: low 4 bits
          this.irqLatch = (this.irqLatch & ~0x0f) | (value & 0x0f)
          break
        case 2:  // IRQ Latch: high 4 bits
          this.irqLatch = (this.irqLatch & ~0xf0) | ((value & 0x0f) << 4)
          break
        case 4:  // IRQ Control
          this.irqControl = value
          if ((this.irqControl & IRQ_ENABLE) !== 0) {
            this.irqCounter = this.irqLatch
          }
          this.options.clearIrqRequest(IrqType.EXTERNAL)
          break
        case 6:  // IRQ Acknowledge
          // Copy to enable
          {
            const ea = this.irqControl & IRQ_ENABLE_AFTER
            this.irqControl = (this.irqControl & ~IRQ_ENABLE) | (ea << 1)
            this.options.clearIrqRequest(IrqType.EXTERNAL)
          }
          break
        }
      }
    })
  }

  public reset(): void {
    this.irqControl = 0
    this.irqLatch = this.irqCounter = 0
  }

  public save(): object {
    return super.save({
      prgBankMode: this.prgBankMode,
      prgBank: this.prgBank,
      chrBank: this.chrBank,
      irqControl: this.irqControl,
      irqLatch: this.irqLatch,
      irqCounter: this.irqCounter,
    })
  }

  public load(saveData: any): void {
    super.load(saveData)
    this.prgBankMode = saveData.prgBankMode
    // this.prgBank = saveData.prgBank
    // this.chrBank = saveData.chrBank
    this.irqControl = saveData.irqControl
    this.irqLatch = saveData.irqLatch
    this.irqCounter = saveData.irqCounter

    for (let i = 0; i < 4; ++i)
      this.setPrgBank(i, saveData.prgBank[i])
    for (let i = 0; i < 8; ++i)
      this.setChrBankOffset(i, saveData.chrBank[i])
  }

  public onHblank(_hcount: number): void {
    if ((this.irqControl & IRQ_ENABLE) !== 0) {
      let c = this.irqCounter
      if (c >= 255) {
        c += this.irqLatch - 255
        this.options.requestIrq(IrqType.EXTERNAL)
      } else {
        if ((this.irqControl & IRQ_MODE) === 0)  // scanline mode
          c += 1
        else  // cycle mode
          c += 114  // 341 / 3
      }
      this.irqCounter = c
    }
  }

  private setPrgBank(bank: number, value: number): void {
    this.prgBank[bank] = value
    this.options.setPrgBank(bank, value)
  }

  private setChrBankOffset(bank: number, value: number): void {
    this.chrBank[bank] = value
    this.options.setChrBankOffset(bank, value)
  }
}

export class Mapper023 extends Mapper023Base {
  public static create(options: MapperOptions): Mapper {
    return new Mapper023(options)
  }

  constructor(options: MapperOptions) {
    super(options, {
      0: 0,
      4: 2,
      8: 4,
      0x0c: 6,

      1: 2,
      2: 4,
      3: 6,
    })
  }
}

export class Mapper025 extends Mapper023Base {
  public static create(options: MapperOptions): Mapper {
    return new Mapper025(options)
  }

  constructor(options: MapperOptions) {
    super(options, {
      0: 0,
      1: 4,
      2: 2,
      3: 6,
    })
  }
}
