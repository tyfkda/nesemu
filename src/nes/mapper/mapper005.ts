// MMC5

import {IrqType} from '../cpu/cpu'
import {Mapper, MapperOptions} from './mapper'
import {PpuReg, PpuMaskBit} from '../ppu/types'
import {Util} from '../../util/util'

export class Mapper005 extends Mapper {
  private regs = new Uint8Array(8)
  private ram = new Uint8Array(0x2000)  // PRG RAM
  private exram = new Uint8Array(0x0400)  // Expansion RAM
  private maxPrg = 0
  private prgMode = 0  // 0=One 32KB, 1=Two 16KB, 2=One 16KB + two 8KB, 3=Four 8KB
  private chrMode = 0  // 0=8KB pages, 1=4KB pages, 2=2KB pages, 3=1KB pages
  private upperChrBit = 0
  private irqHlineEnable = false
  private irqHlineCompare = -1
  private irqHlineCounter = -1
  private ppuInFrame = false

  public static create(options: MapperOptions): Mapper {
    return new Mapper005(options)
  }

  constructor(private options: MapperOptions) {
    super()

    const BANK_BIT = 13  // 0x2000
    this.maxPrg = (this.options.prgSize >> BANK_BIT) - 1

    this.options.prgBankCtrl.setPrgBank(3, this.maxPrg)

    for (let i = 0; i < 8; ++i)
      this.options.ppu.setChrBankOffset(i, i)

    this.ram.fill(0xff)
    this.options.bus.setReadMemory(0x6000, 0x7fff, (adr) => this.ram[adr & 0x1fff])
    this.options.bus.setWriteMemory(0x6000, 0x7fff,
                                    (adr, value) => { this.ram[adr & 0x1fff] = value })

    // Select
    this.options.bus.setWriteMemory(0x4000, 0x5fff, (adr, value) => {
      if (adr >= 0x5c00 /*&& adr <= 0x5fff*/) {
        this.exram[adr - 0x5c00] = value
        return
      }

      switch (adr) {
      default:
        this.options.writeToApu(adr, value)
        break
      case 0x5100:
        this.prgMode = value & 3
        break
      case 0x5101:
        this.chrMode = value & 3
        break
      case 0x5105:
        this.options.ppu.setMirrorModeBit(value)
        break
      case 0x5113:
        // RAM
        break
      case 0x5114:
        switch (this.prgMode) {
        case 3:
          this.options.prgBankCtrl.setPrgBank(0, value & this.maxPrg)
          break
        default:
          break
        }
        break
      case 0x5115:
        switch (this.prgMode) {
        case 1:
        case 2:
          this.options.prgBankCtrl.setPrgBank(0,  (value & -2)      & this.maxPrg)
          this.options.prgBankCtrl.setPrgBank(1, ((value & -2) + 1) & this.maxPrg)
          break
        case 3:
          this.options.prgBankCtrl.setPrgBank(1, value & this.maxPrg)
          break
        default:
          break
        }
        break
      case 0x5116:
        switch (this.prgMode) {
        case 2:
        case 3:
          this.options.prgBankCtrl.setPrgBank(2, value & this.maxPrg)
          break
        default:
          break
        }
        break
      case 0x5117:
        switch (this.prgMode) {
        case 0:
          this.options.prgBankCtrl.setPrgBank(0,  (value & -4)      & this.maxPrg)
          this.options.prgBankCtrl.setPrgBank(1, ((value & -4) + 1) & this.maxPrg)
          this.options.prgBankCtrl.setPrgBank(2, ((value & -4) + 2) & this.maxPrg)
          this.options.prgBankCtrl.setPrgBank(3, ((value & -4) + 3) & this.maxPrg)
          break
        case 1:
          this.options.prgBankCtrl.setPrgBank(2,  (value & -2)      & this.maxPrg)
          this.options.prgBankCtrl.setPrgBank(3, ((value & -2) + 1) & this.maxPrg)
          break
        case 2:
        case 3:
          this.options.prgBankCtrl.setPrgBank(3, value & this.maxPrg)
          break
        default:
          break
        }
        break

      case 0x5120: case 0x5121: case 0x5122: case 0x5123:
      case 0x5124: case 0x5125: case 0x5126: case 0x5127:
        switch (this.chrMode) {
        case 0:
          if (adr === 0x5127) {
            const v = (value & -8) | (this.upperChrBit << 8)
            this.options.ppu.setChrBankOffset(0, v)
            this.options.ppu.setChrBankOffset(1, v + 1)
            this.options.ppu.setChrBankOffset(2, v + 2)
            this.options.ppu.setChrBankOffset(3, v + 3)
            this.options.ppu.setChrBankOffset(4, v + 4)
            this.options.ppu.setChrBankOffset(5, v + 5)
            this.options.ppu.setChrBankOffset(6, v + 6)
            this.options.ppu.setChrBankOffset(7, v + 7)
          }
          break
        case 1:
          if ((adr & 3) === 3) {
            const a = adr & 4
            const v = (value & -4) | (this.upperChrBit << 8)
            this.options.ppu.setChrBankOffset(a,     v)
            this.options.ppu.setChrBankOffset(a + 1, v + 1)
            this.options.ppu.setChrBankOffset(a + 2, v + 2)
            this.options.ppu.setChrBankOffset(a + 3, v + 3)
          }
          break
        case 2:
          if ((adr & 1) === 1) {
            const a = adr & 6
            const v = (value & -2) | (this.upperChrBit << 8)
            this.options.ppu.setChrBankOffset(a,     v)
            this.options.ppu.setChrBankOffset(a + 1, v + 1)
          }
          break
        case 3:
          {
            const v = value | (this.upperChrBit << 8)
            this.options.ppu.setChrBankOffset(adr & 7, v)
          }
          break
        }
        break

      case 0x5130:
        this.upperChrBit = value & 3
        break

      case 0x5203:  // IRQ ScanlineCompare Value
        this.irqHlineCompare = value
        break
      case 0x5204:  // Scanline IRQ Status
        this.irqHlineEnable = (value & 0x80) !== 0
        break
      }
    })

    this.options.bus.setReadMemory(0x4000, 0x5fff, (adr) => {
      if (adr >= 0x5c00 /*&& adr <= 0x5fff*/) {
        return this.exram[adr - 0x5c00]
      }

      switch (adr) {
      default:
        return this.options.readFromApu(adr)

      case 0x5204:
        this.options.cpu.clearIrqRequest(IrqType.EXTERNAL)
        return (this.ppuInFrame ? 0x40 : 0x00)
      }
    })

  }

  public reset(): void {
    this.irqHlineEnable = false
    this.irqHlineCompare = this.irqHlineCounter = -1
  }

  public save(): object {
    return {
      regs: Util.convertUint8ArrayToBase64String(this.regs),
      ram: Util.convertUint8ArrayToBase64String(this.ram),
      irqHlineEnable: this.irqHlineEnable,
      irqHlineCompare: this.irqHlineCompare,
      irqHlineCounter: this.irqHlineCounter,
    }
  }

  public load(saveData: any): void {
    this.regs = Util.convertBase64StringToUint8Array(saveData.regs)
    this.ram = Util.convertBase64StringToUint8Array(saveData.ram)
    this.irqHlineEnable = saveData.irqHlineEnable
    this.irqHlineCompare = saveData.irqHlineCompare
    this.irqHlineCounter = saveData.irqHlineCounter
  }

  public onHblank(hcount: number): void {
    // http://bobrost.com/nes/files/mmc3irqs.txt
    // Note: BGs OR sprites MUST be enabled in $2001 (bits 3 and 4)
    // in order for the countdown to occur.
    const regs = this.options.ppu.getRegs()
    if ((regs[PpuReg.MASK] & (PpuMaskBit.SHOW_SPRITE | PpuMaskBit.SHOW_BG)) !== 0) {
      this.ppuInFrame = hcount < 240

      if (this.irqHlineEnable && this.irqHlineCompare === hcount) {
        this.options.cpu.requestIrq(IrqType.EXTERNAL)
      }
    } else {
      this.ppuInFrame = false
    }
  }
}
