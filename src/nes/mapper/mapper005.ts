// MMC5

import {IrqType} from '../cpu/cpu'
import {Mapper, MapperOptions} from './mapper'
import {PpuReg, PpuMaskBit} from '../ppu/types'
import {Util} from '../../util/util'

import {Address, Byte} from '../types'
import {PpuCtrlBit} from '../ppu/types'

const VRETURN = 262

export class Mapper005 extends Mapper {
  private regs = new Uint8Array(8)
  private ram = new Uint8Array(0x2000)  // PRG RAM
  private exram = new Uint8Array(0x0400)  // Expansion RAM
  private maxPrg = 0
  private bankSelect = 0
  private prgMode = 0  // 0=One 32KB, 1=Two 16KB, 2=One 16KB + two 8KB, 3=Four 8KB
  private chrMode = 0  // 0=8KB pages, 1=4KB pages, 2=2KB pages, 3=1KB pages
  private upperChrBit = 0
  // private irqHlineEnable = false
  // private irqHlineCompare = -1
  // private irqHlineCounter = -1
  // private irqLatch = 0

  private ppuInFrame = false
  private needInFrame = false
  private ntReadCounter = 0
  private scanlineCounter = 0
  private ppuIdleCounter = 0
  private splitInSplitRegion = false
  private irqCounterTarget = 0
  private irqPending = false
  private irqEnabled = false

  private lastPpuReadAddr: Address = 0

  public static create(options: MapperOptions): Mapper {
    return new Mapper005(options)
  }

  private detectScanlineStart(addr: Address): void {
    if (addr >= 0x2000 && addr <= 0x2FFF) {
      if (this.lastPpuReadAddr === addr) {
        //Count consecutive identical reads
        ++this.ntReadCounter
      } else {
        this.ntReadCounter = 0
      }

      if (this.ntReadCounter >= 2) {
        if (!this.ppuInFrame && !this.needInFrame) {
          this.needInFrame = true
          this.scanlineCounter = 0
        } else {
          ++this.scanlineCounter
          if (this.irqCounterTarget === this.scanlineCounter) {
            this.irqPending = true
            if (this.irqEnabled) {
              this.options.cpu.requestIrq(IrqType.EXTERNAL)
            }
          }
        }
        this.splitTileNumber = 0
      }
    } else {
      this.ntReadCounter = 0
    }
  }

  constructor(private options: MapperOptions) {
    super()

    const BANK_BIT = 13  // 0x2000
    this.maxPrg = (this.options.prgSize >> BANK_BIT) - 1

    this.options.prgBankCtrl.setPrgBank(3, this.maxPrg)

    for (let i = 0; i < 8; ++i)
      this.options.ppu.setChrBankOffset(i, i)

    this.ram.fill(0xff)
    this.options.bus.setReadMemory(0x2000, 0x3fff, adr => {  // PPU
      const isNtFetch = adr >= 0x2000 && adr <= 0x2FFF && (adr & 0x3FF) < 0x3C0
      if (isNtFetch) {
        //Nametable data, not an attribute fetch
        this.splitInSplitRegion = false
        ++this.splitTileNumber

        if (this.ppuInFrame) {
          this.updateChrBanks(false)
        } else if(this.needInFrame) {
          this.needInFrame = false
          this.ppuInFrame = true
          this.updateChrBanks(false)
        }
      }
      this.detectScanlineStart(adr)

      this.ppuIdleCounter = 3
      this.lastPpuReadAddr = adr



      const reg = adr & 7
      return this.options.ppu.read(reg)
    })
    // this.options.bus.setWriteMemory(0x2000, 0x3fff, (adr, value) => {  // PPU
    //   const reg = adr & 7
    //   this.options.ppu.write(reg, value)
    // })
    this.options.bus.setReadMemory(0x6000, 0x7fff, (adr) => this.ram[adr & 0x1fff])
    this.options.bus.setWriteMemory(0x6000, 0x7fff,
                                    (adr, value) => { this.ram[adr & 0x1fff] = value })

    // Select
    this.options.bus.setWriteMemory(0x4000, 0x5fff, (adr, value) => {
//console.log(`Write ${Util.hex(adr, 4)} = ${Util.hex(value, 2)}`)
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
        this.updateChrBanks(true)
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
      case 0x5128: case 0x5129: case 0x512a: case 0x512b:
        this.switchChrBank(adr, value)
        break
      case 0x5130:
//console.log(`Write: 5130: ${Util.hex(value)}`)
        this.upperChrBit = value & 3
        break

      case 0x5203:  // IRQ ScanlineCompare Value
        this.irqCounterTarget = value
        break
      case 0x5204:  // Scanline IRQ Status
        this.irqEnabled = (value & 0x80) === 0x80
        if (!this.irqEnabled) {
          this.options.cpu.clearIrqRequest(IrqType.EXTERNAL)
        } else if (this.irqEnabled && this.irqPending) {
          this.options.cpu.requestIrq(IrqType.EXTERNAL)
        }
        break
      }
    })

    this.options.bus.setReadMemory(0x4000, 0x5fff, (adr) => {
//console.log(`Read ${Util.hex(adr, 4)}`)
      if (adr >= 0x5c00 /*&& adr <= 0x5fff*/) {
        return this.exram[adr - 0x5c00]
      }

      switch (adr) {
      default:
        return this.options.readFromApu(adr)

      case 0x5204:
        {
          const value = (this.ppuInFrame ? 0x40 : 0x00) | (this.irqPending ? 0x80 : 0x00)
          this.irqPending = false
          this.options.cpu.clearIrqRequest(IrqType.EXTERNAL)
          return value
        }
      }
    })

/*
    // Select
    this.options.bus.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
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
    this.options.bus.setWriteMemory(0xe000, 0xffff, (adr, _value) => {
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
    let mirror = MirrorMode.VERT
    // Dirty hack: detect mirror mode from ROM hash.
    switch (this.options.romHash) {
    case '6c0cd447297e95e45db35a4373dbeae1':  // Babel no Tou
    case 'e791b12fc3419a2e2f8a5ed64b210d72':  // Dragon Spirit
    case '44c206c61ff37406815f21b922e105c7':  // Family Pinball
      mirror = MirrorMode.HORZ
      break
    default:
      break
    }
    this.options.ppu.setMirrorMode(mirror)  // Default vertical mirroring?
*/
  }

  public reset() {
    // this.irqHlineEnable = false
    // this.irqHlineCompare = this.irqHlineCounter = -1
  }

  public save(): object {
    return {
      regs: Util.convertUint8ArrayToBase64String(this.regs),
      ram: Util.convertUint8ArrayToBase64String(this.ram),
      bankSelect: this.bankSelect,
      // irqHlineEnable: this.irqHlineEnable,
      // irqHlineCompare: this.irqHlineCompare,
      // irqHlineCounter: this.irqHlineCounter,
      // irqLatch: this.irqLatch,
    }
  }

  public load(saveData: any): void {
    this.regs = Util.convertBase64StringToUint8Array(saveData.regs)
    this.ram = Util.convertBase64StringToUint8Array(saveData.ram)
    this.bankSelect = saveData.bankSelect
    // this.irqHlineEnable = saveData.irqHlineEnable
    // this.irqHlineCompare = saveData.irqHlineCompare
    // this.irqHlineCounter = saveData.irqHlineCounter
    // this.irqLatch = saveData.irqLatch

    this.setPrgBank(this.bankSelect)
    // this.setChrBank(this.bankSelect)
  }

  public onHblank(hcount: number): void {
    // http://bobrost.com/nes/files/mmc3irqs.txt
    // Note: BGs OR sprites MUST be enabled in $2001 (bits 3 and 4)
    // in order for the countdown to occur.
    const regs = this.options.ppu.getRegs()
    if ((regs[PpuReg.MASK] & (PpuMaskBit.SHOW_SPRITE | PpuMaskBit.SHOW_BG)) !== 0) {
      // this.ppuInFrame = hcount < 240

      //if (--this.irqHlineCounter === 0 && this.irqHlineEnable) {
      // if (this.irqHlineEnable && this.irqHlineCompare === hcount) {
      //   this.options.cpu.requestIrq(IrqType.EXTERNAL)
      // }
    } else {
      // this.ppuInFrame = false
    }

    switch (hcount) {
    case VRETURN:
      //this.irqHlineCounter = this.irqHlineCompare
      break
    default:
      break
    }
  }

  private setPrgBank(swap: number): void {
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

  private switchChrBank(adr: Address, value: Byte): void {
    const reg = adr - 0x5120
    const newValue = value | (this.upperChrBit << 8)
    if (newValue !== this.chrBanks[reg] || this.lastChrReg !== adr) {
      this.chrBanks[reg] = newValue
      this.lastChrReg = adr
      this.updateChrBanks(true)
    }
  }

  private chrBanks = new Uint16Array(8)
  private lastChrReg = 0
  private prevChrA = false
  private splitTileNumber = -1

  private updateChrBanks(forceUpdate: boolean): void {
    //const largeSprites = (_mmc5MemoryHandler->GetReg(0x2000) & 0x20) !== 0
    const regs = this.options.ppu.getRegs()
    const largeSprites = (regs[PpuReg.CTRL] & PpuCtrlBit.SPRITE_SIZE) !== 0

    if (!largeSprites) {
      //Using 8x8 sprites resets the last written to bank logic
      this.lastChrReg = 0
    }

    const chrA = !largeSprites || (this.splitTileNumber >= 32 && this.splitTileNumber < 40) ||
        (!this.ppuInFrame && this.lastChrReg <= 0x5127)
    if (!forceUpdate && chrA === this.prevChrA) {
      // return
    }
    this.prevChrA = chrA

    switch (this.chrMode) {
    case 0:
      this.selectChrPage8x(0, this.chrBanks[chrA ? 0x07 : 0x0B] /*<< 3*/ & -8)
      break
    case 1:
      this.selectChrPage4x(0, this.chrBanks[chrA ? 0x03 : 0x0B] /*<< 2*/ & -4)
      this.selectChrPage4x(1, this.chrBanks[chrA ? 0x07 : 0x0B] /*<< 2*/ & -4)
      break
    case 2:
      this.selectChrPage2x(0, this.chrBanks[chrA ? 0x01 : 0x09] /*<< 1*/ & -2)
      this.selectChrPage2x(1, this.chrBanks[chrA ? 0x03 : 0x0B] /*<< 1*/ & -2)
      this.selectChrPage2x(2, this.chrBanks[chrA ? 0x05 : 0x09] /*<< 1*/ & -2)
      this.selectChrPage2x(3, this.chrBanks[chrA ? 0x07 : 0x0B] /*<< 1*/ & -2)
      break
    case 3:
      this.selectChrPage(0, this.chrBanks[chrA ? 0x00 : 0x08])
      this.selectChrPage(1, this.chrBanks[chrA ? 0x01 : 0x09])
      this.selectChrPage(2, this.chrBanks[chrA ? 0x02 : 0x0A])
      this.selectChrPage(3, this.chrBanks[chrA ? 0x03 : 0x0B])
      this.selectChrPage(4, this.chrBanks[chrA ? 0x04 : 0x08])
      this.selectChrPage(5, this.chrBanks[chrA ? 0x05 : 0x09])
      this.selectChrPage(6, this.chrBanks[chrA ? 0x06 : 0x0A])
      this.selectChrPage(7, this.chrBanks[chrA ? 0x07 : 0x0B])
      break
    default: break  // assert
    }
  }

  private selectChrPage8x(slot: number, page: number): void {
    this.selectChrPage4x(slot, page)
    this.selectChrPage4x(slot * 2 + 1, page + 4)
  }

  private selectChrPage4x(slot: number, page: number): void {
    this.selectChrPage2x(slot, page)
    this.selectChrPage2x(slot * 2 + 1, page + 2)
  }

  private selectChrPage2x(slot: number, page: number): void {
    this.selectChrPage(slot, page)
    this.selectChrPage(slot * 2 + 1, page + 1)
  }

  private selectChrPage(slot: number, page: number): void {
    this.options.ppu.setChrBankOffset(slot, page)
  }

  // private setIrqHlineValue(line: number): void {
  //   this.irqHlineCompare = line
  //   this.irqHlineCounter = this.irqHlineCompare
  // }

  // private enableIrqHline(value: boolean): void {
  //   this.irqHlineEnable = value
  // }

  // private resetIrqHlineCounter(): void {
  //   this.irqHlineCounter = 0
  // }
}
