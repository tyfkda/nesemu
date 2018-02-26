// MMC3

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

const VRETURN = 262

export class Mapper004 extends Mapper {
  private irqHlineEnable: boolean
  private irqHlineValue: number
  private irqHlineCounter: number

  public static create(pbc: PrgBankController, size: number, cpu: Cpu, ppu: Ppu): Mapper {
    return new Mapper004(pbc, size, cpu, ppu)
  }

  constructor(prgBankCtrl: PrgBankController, prgSize: number, private cpu: Cpu, private ppu: Ppu) {
    super()

    this.irqHlineEnable = false
    this.irqHlineValue = this.irqHlineCounter = -1

    const BANK_BIT = 13  // 0x2000
    const regs = new Uint8Array(8)
    const maxPrg = (prgSize >> BANK_BIT) - 1

    let bankSelect = 0

    prgBankCtrl.setPrgBank(3, maxPrg)

    const setPrgBank = (swap) => {
      if ((swap & 0x40) === 0) {
        prgBankCtrl.setPrgBank(0, regs[6])
        prgBankCtrl.setPrgBank(1, regs[7])
        prgBankCtrl.setPrgBank(2, maxPrg - 1)
      } else {
        prgBankCtrl.setPrgBank(2, regs[6])
        prgBankCtrl.setPrgBank(1, regs[7])
        prgBankCtrl.setPrgBank(0, maxPrg - 1)
      }
    }
    const setChrBank = (swap) => {
      if ((swap & 0x80) === 0) {
        ppu.setChrBankOffset(0, regs[0] & 0xfe)
        ppu.setChrBankOffset(1, regs[0] | 1)
        ppu.setChrBankOffset(2, regs[1] & 0xfe)
        ppu.setChrBankOffset(3, regs[1] | 1)
        ppu.setChrBankOffset(4, regs[2])
        ppu.setChrBankOffset(5, regs[3])
        ppu.setChrBankOffset(6, regs[4])
        ppu.setChrBankOffset(7, regs[5])
      } else {
        ppu.setChrBankOffset(4, regs[0] & 0xfe)
        ppu.setChrBankOffset(5, regs[0] | 1)
        ppu.setChrBankOffset(6, regs[1] & 0xfe)
        ppu.setChrBankOffset(7, regs[1] | 1)
        ppu.setChrBankOffset(0, regs[2])
        ppu.setChrBankOffset(1, regs[3])
        ppu.setChrBankOffset(2, regs[4])
        ppu.setChrBankOffset(3, regs[5])
      }
    }

    // PRG RAM
    const ram = new Uint8Array(0x2000)
    ram.fill(0xff)
    cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
    cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })

    // Select
    cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if ((adr & 1) === 0) {
        bankSelect = value
        setPrgBank(bankSelect)
        setChrBank(bankSelect)
      } else {
        const reg = bankSelect & 0x07
        regs[reg] = value
        if (reg < 6) {  // CHR
          setChrBank(bankSelect)
        } else {  // PRG
          setPrgBank(bankSelect)
        }
      }
    })

    // Mirroring
    cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if ((adr & 1) === 0) {
        ppu.setMirrorMode((value & 1) === 0 ? MirrorMode.VERT : MirrorMode.HORZ)
      } else {
        // PRG RAM protect, TODO: Implement.
      }
    })

    // IRQ
    let irqLatch = 0
    cpu.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if ((adr & 1) === 0) {
        irqLatch = value
        this.setIrqHlineValue(irqLatch)
      } else {
        this.setIrqHlineValue(irqLatch)
      }
    })
    cpu.setWriteMemory(0xe000, 0xffff, (adr, value) => {
      if ((adr & 1) === 0) {
        this.enableIrqHline(false)
        this.resetIrqHlineCounter()
      } else {
        this.enableIrqHline(true)
      }
    })

    setPrgBank(bankSelect)  // Initial

    // http://wiki.nesdev.com/w/index.php/INES#Flags_6
    // iNes header, flags 6
    // > Some mappers, such as MMC1, MMC3, and AxROM, can control nametable mirroring.
    // > They ignore bit 0
    ppu.setMirrorMode(MirrorMode.VERT)  // Default vertical mirroring?
  }

  public reset() {
    this.irqHlineEnable = false
    this.irqHlineValue = this.irqHlineCounter = -1
  }

  public onHblank(hcount: number): void {
    // http://bobrost.com/nes/files/mmc3irqs.txt
    // Note: BGs OR sprites MUST be enabled in $2001 (bits 3 and 4)
    // in order for the countdown to occur.
    if ((this.ppu.regs[1] & 0x18) !== 0) {
      if (--this.irqHlineCounter === 0 && this.irqHlineEnable) {
        this.cpu.requestIrq()
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
