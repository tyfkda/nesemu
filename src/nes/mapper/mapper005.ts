// MMC5

import {IrqType} from '../cpu/cpu'
import {Mapper, MapperOptions} from './mapper'
import {PpuReg, PpuCtrlBit, PpuMaskBit} from '../ppu/types'
import {VBlank} from '../const'
import {Address, Byte} from '../types'

const kChrBankTable: Array<Array<number>> = [
  [0, 1,  2,  3, 4, 5,  6,  7],
  [8, 9, 10, 11, 8, 9, 10, 11],
]

export class Mapper005 extends Mapper {
  private exram = new Uint8Array(0x0400)  // Expansion RAM
  private maxPrg = 0
  private prgMode = 3  // 0=One 32KB, 1=Two 16KB, 2=One 16KB + two 8KB, 3=Four 8KB
  private chrMode = 0  // 0=8KB pages, 1=4KB pages, 2=2KB pages, 3=1KB pages
  private upperChrBit = 0
  private irqHlineEnable = false
  private irqHlineCompare = -1
  private irqHlineCounter = -1
  private ppuInFrame = false
  private muls = new Uint8Array([0xff, 0xff])
  private chrBanks = new Uint16Array(12)  // 0x5120~0x512b
  private lastChrReg = -1
  private prevChrA = 1

  public static create(options: MapperOptions): Mapper {
    return new Mapper005(options)
  }

  constructor(options: MapperOptions) {
    super(options, 0x2000)

    const BANK_BIT = 13  // 0x2000
    this.maxPrg = (this.options.cartridge!.prgRom.byteLength >> BANK_BIT) - 1

    // Select
    this.options.setWriteMemory(0x4000, 0x5fff, (adr, value) => {
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
        this.updateChrBanks(false)
        break
      case 0x5105:
        this.options.setMirrorModeBit(value)
        break
      case 0x5113:
        // RAM
        break
      case 0x5114:
        switch (this.prgMode) {
        case 3:
          this.options.setPrgBank(0, value & this.maxPrg)
          break
        default:
          break
        }
        break
      case 0x5115:
        switch (this.prgMode) {
        case 1:
        case 2:
          this.options.setPrgBank(0,  (value & -2)      & this.maxPrg)
          this.options.setPrgBank(1, ((value & -2) + 1) & this.maxPrg)
          break
        case 3:
          this.options.setPrgBank(1, value & this.maxPrg)
          break
        default:
          break
        }
        break
      case 0x5116:
        switch (this.prgMode) {
        case 2:
        case 3:
          this.options.setPrgBank(2, value & this.maxPrg)
          break
        default:
          break
        }
        break
      case 0x5117:
        switch (this.prgMode) {
        case 0:
          this.options.setPrgBank(0,  (value & -4)      & this.maxPrg)
          this.options.setPrgBank(1, ((value & -4) + 1) & this.maxPrg)
          this.options.setPrgBank(2, ((value & -4) + 2) & this.maxPrg)
          this.options.setPrgBank(3, ((value & -4) + 3) & this.maxPrg)
          break
        case 1:
          this.options.setPrgBank(2,  (value & -2)      & this.maxPrg)
          this.options.setPrgBank(3, ((value & -2) + 1) & this.maxPrg)
          break
        case 2:
        case 3:
          this.options.setPrgBank(3, value & this.maxPrg)
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
        this.upperChrBit = value & 3
        break

      case 0x5203:  // IRQ ScanlineCompare Value
        this.irqHlineCompare = value
        break
      case 0x5204:  // Scanline IRQ Status
        this.irqHlineEnable = (value & 0x80) !== 0
        break

      case 0x5205: case 0x5206:  // Unsigned 8x8 to 16 Multiplier
        this.muls[adr - 0x5205] = value
        break
      }
    })

    this.options.setReadMemory(0x4000, 0x5fff, (adr) => {
      if (adr >= 0x5c00 /*&& adr <= 0x5fff*/) {
        return this.exram[adr - 0x5c00]
      }

      switch (adr) {
      default:
        return this.options.readFromApu(adr)

      case 0x5204:
        // this.options.clearIrqRequest(IrqType.EXTERNAL)
        return (this.ppuInFrame ? 0x40 : 0x00)

      case 0x5205: case 0x5206:  // Unsigned 8x8 to 16 Multiplier
        return ((this.muls[0] * this.muls[1]) >> ((adr - 0x5205) << 3)) & 0xff
      }
    })
  }

  public reset(): void {
    this.irqHlineEnable = false
    this.irqHlineCompare = this.irqHlineCounter = -1
    this.prgMode = 3

    for (let i = 0; i < 4; ++i)
      this.options.setPrgBank(i, this.maxPrg)

    for (let i = 0; i < 8; ++i)
      this.options.setChrBankOffset(i, i)
  }

  public save(): object {
    return super.save({
      irqHlineEnable: this.irqHlineEnable,
      irqHlineCompare: this.irqHlineCompare,
      irqHlineCounter: this.irqHlineCounter,
    })
  }

  public load(saveData: any): void {
    super.load(saveData)
    this.irqHlineEnable = saveData.irqHlineEnable
    this.irqHlineCompare = saveData.irqHlineCompare
    this.irqHlineCounter = saveData.irqHlineCounter
  }

  public onHblank(hcount: number): void {
    // http://bobrost.com/nes/files/mmc3irqs.txt
    // Note: BGs OR sprites MUST be enabled in $2001 (bits 3 and 4)
    // in order for the countdown to occur.
    const regs = this.options.getPpuRegs()
    this.ppuInFrame = hcount < VBlank.START && (regs[PpuReg.MASK] & (PpuMaskBit.SHOW_SPRITE | PpuMaskBit.SHOW_BG)) !== 0
    if (this.ppuInFrame && this.irqHlineEnable && this.irqHlineCompare === hcount && hcount !== 0) {
      this.options.requestIrq(IrqType.EXTERNAL)
    }
  }

  private switchChrBank(adr: Address, value: Byte) {
    const newValue = value | (this.upperChrBit << 8)
    const reg = adr - 0x5120
    if (newValue !== this.chrBanks[reg] || this.lastChrReg !== reg) {
      this.chrBanks[reg] = newValue
      this.lastChrReg = reg
      this.updateChrBanks(true)
    }
  }

  private updateChrBanks(forceUpdate: boolean) {
    const largeSprites = (this.options.getPpuRegs()[PpuReg.CTRL] & PpuCtrlBit.SPRITE_SIZE) !== 0

    if (!largeSprites) {
      this.lastChrReg = -1
    }

    const chrA = (!largeSprites || (!this.ppuInFrame && this.lastChrReg <= 7)) ? 0 : 1
    if (!forceUpdate && chrA === this.prevChrA)
      return
    this.prevChrA = chrA

    const table = kChrBankTable[chrA]
    const ppu = this.options

    switch (this.chrMode) {
    case 0:
      {
        const v = this.chrBanks[table[7]] << 3
        for (let i = 0; i < 8; ++i)
          ppu.setChrBankOffset(i, v + i)
      }
      break
    case 1:
      for (let i = 0; i < 8; i += 4) {
        const v = this.chrBanks[table[i + 3]] << 2
        for (let j = 0; j < 4; ++j)
          ppu.setChrBankOffset(i + j, v + j)
      }
      break
    case 2:
      for (let i = 0; i < 8; i += 2) {
        const v = this.chrBanks[table[i + 1]] << 1
        for (let j = 0; j < 2; ++j)
          ppu.setChrBankOffset(i + j, v + j)
      }
      break
    case 3:
      for (let i = 0; i < 8; ++i)
        ppu.setChrBankOffset(i, this.chrBanks[table[i]])
      break
    }
  }
}
