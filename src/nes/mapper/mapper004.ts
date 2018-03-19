// MMC3

import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu'
import Util from '../../util/util'

const VRETURN = 262

export class Mapper004 extends Mapper {
  private regs = new Uint8Array(8)
  private ram = new Uint8Array(0x2000)  // PRG RAM
  private maxPrg = 0
  private bankSelect = 0
  private irqHlineEnable = false
  private irqHlineValue = -1
  private irqHlineCounter = -1
  private irqLatch = 0

  public static create(options: MapperOptions): Mapper {
    return new Mapper004(options)
  }

  constructor(private options: MapperOptions) {
    super()

    const BANK_BIT = 13  // 0x2000
    this.maxPrg = (options.prgSize >> BANK_BIT) - 1

    this.options.prgBankCtrl.setPrgBank(3, this.maxPrg)

    this.ram.fill(0xff)
    this.options.bus.setReadMemory(0x6000, 0x7fff, (adr) => this.ram[adr & 0x1fff])
    this.options.bus.setWriteMemory(0x6000, 0x7fff,
                                    (adr, value) => { this.ram[adr & 0x1fff] = value })

    // Select
    this.options.bus.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.bankSelect = value
        this.setPrgBank(this.bankSelect)
        this.setChrBank(this.bankSelect)
      } else {
        const reg = this.bankSelect & 0x07
        this.regs[reg] = value
        if (reg < 6) {  // CHR
          this.setChrBank(this.bankSelect)
        } else {  // PRG
          this.setPrgBank(this.bankSelect)
        }
      }
    })

    // Mirroring
    this.options.bus.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.options.ppu.setMirrorMode((value & 1) === 0 ? MirrorMode.VERT : MirrorMode.HORZ)
      } else {
        // PRG RAM protect, TODO: Implement.
      }
    })

    // IRQ
    this.options.bus.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.irqLatch = value
        this.setIrqHlineValue(this.irqLatch)
      } else {
        this.setIrqHlineValue(this.irqLatch)
      }
    })
    this.options.bus.setWriteMemory(0xe000, 0xffff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.enableIrqHline(false)
        this.resetIrqHlineCounter()
      } else {
        this.enableIrqHline(true)
      }
    })

    this.setPrgBank(this.bankSelect)  // Initial

    // http://wiki.nesdev.com/w/index.php/INES#Flags_6
    // iNes header, flags 6
    // > Some mappers, such as MMC1, MMC3, and AxROM, can control nametable mirroring.
    // > They ignore bit 0
    this.options.ppu.setMirrorMode(MirrorMode.VERT)  // Default vertical mirroring?
  }

  public reset() {
    this.irqHlineEnable = false
    this.irqHlineValue = this.irqHlineCounter = -1
  }

  public save(): object {
    return {
      regs: Util.convertUint8ArrayToBase64String(this.regs),
      ram: Util.convertUint8ArrayToBase64String(this.ram),
      bankSelect: this.bankSelect,
      irqHlineEnable: this.irqHlineEnable,
      irqHlineValue: this.irqHlineValue,
      irqHlineCounter: this.irqHlineCounter,
      irqLatch: this.irqLatch,
    }
  }

  public load(saveData: any): void {
    this.regs = Util.convertBase64StringToUint8Array(saveData.regs)
    this.ram = Util.convertBase64StringToUint8Array(saveData.ram)
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
    if ((this.options.ppu.regs[1] & 0x18) !== 0) {
      if (--this.irqHlineCounter === 0 && this.irqHlineEnable) {
        this.options.cpu.requestIrq()
      }
    }

    switch (hcount) {
    case VRETURN:
      this.irqHlineCounter = this.irqHlineValue
      break
    default:
      break
    }
  }

  private setPrgBank(swap) {
    if ((swap & 0x40) === 0) {
      this.options.prgBankCtrl.setPrgBank(0, this.regs[6])
      this.options.prgBankCtrl.setPrgBank(1, this.regs[7])
      this.options.prgBankCtrl.setPrgBank(2, this.maxPrg - 1)
    } else {
      this.options.prgBankCtrl.setPrgBank(2, this.regs[6])
      this.options.prgBankCtrl.setPrgBank(1, this.regs[7])
      this.options.prgBankCtrl.setPrgBank(0, this.maxPrg - 1)
    }
  }

  private setChrBank(swap) {
    if ((swap & 0x80) === 0) {
      this.options.ppu.setChrBankOffset(0, this.regs[0] & 0xfe)
      this.options.ppu.setChrBankOffset(1, this.regs[0] | 1)
      this.options.ppu.setChrBankOffset(2, this.regs[1] & 0xfe)
      this.options.ppu.setChrBankOffset(3, this.regs[1] | 1)
      this.options.ppu.setChrBankOffset(4, this.regs[2])
      this.options.ppu.setChrBankOffset(5, this.regs[3])
      this.options.ppu.setChrBankOffset(6, this.regs[4])
      this.options.ppu.setChrBankOffset(7, this.regs[5])
    } else {
      this.options.ppu.setChrBankOffset(4, this.regs[0] & 0xfe)
      this.options.ppu.setChrBankOffset(5, this.regs[0] | 1)
      this.options.ppu.setChrBankOffset(6, this.regs[1] & 0xfe)
      this.options.ppu.setChrBankOffset(7, this.regs[1] | 1)
      this.options.ppu.setChrBankOffset(0, this.regs[2])
      this.options.ppu.setChrBankOffset(1, this.regs[3])
      this.options.ppu.setChrBankOffset(2, this.regs[4])
      this.options.ppu.setChrBankOffset(3, this.regs[5])
    }
  }

  private setIrqHlineValue(line: number): void {
    this.irqHlineValue = line
    this.irqHlineCounter = this.irqHlineValue
  }

  private enableIrqHline(value: boolean): void {
    this.irqHlineEnable = value
  }

  private resetIrqHlineCounter(): void {
    this.irqHlineCounter = 0
  }
}
