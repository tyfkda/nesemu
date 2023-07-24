// MMC5

import {IrqType} from '../cpu/cpu'
import {Mapper, MapperOptions} from './mapper'
import {PpuReg, PpuMaskBit} from '../ppu/types'
import {VBlank} from '../const'
import {Address, Byte} from '../types'
import {Util} from '../../util/util'

export class Mapper005 extends Mapper {
  private ioMap = new Map<number, (adr: Address, value?: Byte) => any>()
  private exram = new Uint8Array(0x0400)  // Expansion RAM
  private maxPrg = 0
  private prgMode = 3  // 0=One 32KB, 1=Two 16KB, 2=One 16KB + two 8KB, 3=Four 8KB
  private prgBanks: Uint8Array
  private chrMode = 0  // 0=8KB pages, 1=4KB pages, 2=2KB pages, 3=1KB pages
  private chrBanks = new Uint16Array(12)  // 0x5120~0x512b
  private upperChrBit = 0
  private abMode = 0
  private irqHlineEnable = false
  private irqHlineCompare = -1
  private irqHlineCounter = -1
  private ppuInFrame = false
  private muls = new Uint8Array([0xff, 0xff])

  public static create(options: MapperOptions): Mapper {
    return new Mapper005(options)
  }

  constructor(options: MapperOptions) {
    super(options, 0x2000)

    const BANK_BIT = 13  // 0x2000
    this.maxPrg = (this.options.cartridge!.prgRom.byteLength >> BANK_BIT) - 1
    this.prgBanks = new Uint8Array([0, 1, this.maxPrg - 1, this.maxPrg])

    // IO
    for (const [start, end, flag] of [[0x5100, 0x5130, 1], [0x5200, 0x5206, 3]]) {
      for (let adr = start; adr <= end; ++adr) {
        switch (flag) {
        case 1:
          this.ioMap.set(adr, (adr, value) => this.writeIo(adr, value as Byte))
          break
        case 3:
          this.ioMap.set(adr, (adr, value): any => {
            if (value == null)
              return this.readIo(adr)
            this.writeIo(adr, value as Byte)
          })
          break
        default: console.assert(false); break
        }
      }
    }
    // Expansion RAM
    for (let adr = 0x5c00; adr <= 0x5fff; ++adr) {
      this.ioMap.set(adr, (adr, value): any => {
        const i = adr - 0x5c00
        if (value == null)
          return this.exram[i]
        else
          this.exram[i] = value
      })
    }
    this.options.setPeripheral(this.ioMap)
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
      prgMode: this.prgMode,
      prgBanks: Array.from(this.prgBanks),
      chrMode: this.chrMode,
      chrBanks: Array.from(this.chrBanks),
      abMode: this.abMode,
      upperChrBit: this.upperChrBit,
      irqHlineEnable: this.irqHlineEnable,
      irqHlineCompare: this.irqHlineCompare,
      irqHlineCounter: this.irqHlineCounter,
      exram: Util.convertUint8ArrayToBase64String(this.exram),
      muls: Array.from(this.muls),
    })
  }

  public load(saveData: any): void {
    super.load(saveData)
    if (saveData.prgMode != null)
      this.prgMode = saveData.prgMode
    if (saveData.prgBanks != null)
      this.prgBanks = new Uint8Array(saveData.prgBanks)
    if (saveData.chrMode != null)
      this.chrMode = saveData.chrMode
    if (saveData.chrBanks != null)
      this.chrBanks = new Uint16Array(saveData.chrBanks)
    if (saveData.upperChrBit != null)
      this.upperChrBit = saveData.upperChrBit
    if (saveData.abMode != null)
      this.abMode = saveData.abMode
    if (saveData.exram != null)
      this.exram = Util.convertBase64StringToUint8Array(saveData.exram)
    if (saveData.muls != null)
      this.muls = new Uint8Array(saveData.muls)
    this.irqHlineEnable = saveData.irqHlineEnable
    this.irqHlineCompare = saveData.irqHlineCompare
    this.irqHlineCounter = saveData.irqHlineCounter

    this.updatePrgBanks()
    this.updateChrBanks()
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

  private writeIo(adr: Address, value: Byte): void {
    switch (adr) {
    default:
      break
    case 0x5100:
      this.prgMode = value & 3
      break
    case 0x5101:
      this.chrMode = value & 3
      this.updateChrBanks()
      break
    case 0x5105:
      this.options.setMirrorModeBit(value)
      break
    case 0x5113:
      // RAM
      break
    case 0x5114: case 0x5115: case 0x5116: case 0x5117:
      this.prgBanks[adr - 0x5114] = value
      this.updatePrgBanks()
      break

    case 0x5120: case 0x5121: case 0x5122: case 0x5123:
    case 0x5124: case 0x5125: case 0x5126: case 0x5127:
      this.switchChrBank(adr, value, 0)
      break
    case 0x5128: case 0x5129: case 0x512a: case 0x512b:
      this.switchChrBank(adr, value, 1)
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
  }

  private readIo(adr: Address): Byte {
    switch (adr) {
    default:
      break

    case 0x5204:
      // this.options.clearIrqRequest(IrqType.EXTERNAL)
      return (this.ppuInFrame ? 0x40 : 0x00)

    case 0x5205: case 0x5206:  // Unsigned 8x8 to 16 Multiplier
      return ((this.muls[0] * this.muls[1]) >> ((adr - 0x5205) << 3)) & 0xff
    }
    return 0
  }

  private switchChrBank(adr: Address, value: Byte, abMode: number) {
    this.abMode = abMode
    const newValue = value | (this.upperChrBit << 8)
    const reg = adr - 0x5120
    if (newValue !== this.chrBanks[reg]) {
      this.chrBanks[reg] = newValue
      this.updateChrBanks()
    }
  }

  private updateChrBanks() {
    const opt = this.options

    if (this.abMode === 0) {
      switch (this.chrMode) {
      case 0:
        {
          const vb = this.chrBanks[11] << 3
          for (let i = 0; i < 4; ++i)
            opt.setChrBankOffset(i, vb + i)
          const va = this.chrBanks[7] << 3
          for (let i = 0; i < 4; ++i)
            opt.setChrBankOffset(i + 4, va + i)
        }
        break
      case 1:
        {
          const vb = this.chrBanks[11] << 2
          for (let j = 0; j < 4; ++j)
            opt.setChrBankOffset(j, vb + j)
          const va = this.chrBanks[7] << 2
          for (let j = 0; j < 4; ++j)
            opt.setChrBankOffset(j + 4, va + j)
        }
        break
      case 2:
        for (let i = 0; i < 8; i += 4) {
          const vb = this.chrBanks[9] << 1
          for (let j = 0; j < 2; ++j)
            opt.setChrBankOffset(i + j, vb + j)
          const va = this.chrBanks[5] << 1
          for (let j = 0; j < 2; ++j)
            opt.setChrBankOffset(i + 4 + j, va + j)
        }
        break
      case 3:
        for (let i = 0; i < 4; ++i)
          opt.setChrBankOffset(i, this.chrBanks[i + 8])
        for (let i = 0; i < 4; ++i)
          opt.setChrBankOffset(i + 4, this.chrBanks[i + 4])
        break
      }
    } else {
      switch (this.chrMode) {
      case 0:
        {
          const va = this.chrBanks[3] << 3
          for (let i = 0; i < 4; ++i)
            opt.setChrBankOffset(i, va + i)
          const vb = this.chrBanks[11] << 3
          for (let i = 0; i < 4; ++i)
            opt.setChrBankOffset(i + 4, vb + i)
        }
        break
      case 1:
        {
          const va = this.chrBanks[3] << 2
          for (let j = 0; j < 4; ++j)
            opt.setChrBankOffset(j, va + j)
          const vb = this.chrBanks[11] << 2
          for (let j = 0; j < 4; ++j)
            opt.setChrBankOffset(j + 4, vb + j)
        }
        break
      case 2:
        for (let i = 0; i < 8; i += 4) {
          const va = this.chrBanks[1] << 1
          for (let j = 0; j < 2; ++j)
            opt.setChrBankOffset(i + j, va + j)
          const vb = this.chrBanks[9] << 1
          for (let j = 0; j < 2; ++j)
            opt.setChrBankOffset(i + 4 + j, vb + j)
        }
        break
      case 3:
        for (let i = 0; i < 4; ++i)
          opt.setChrBankOffset(i, this.chrBanks[i])
        for (let i = 0; i < 4; ++i)
          opt.setChrBankOffset(i + 4, this.chrBanks[i + 8])
        break
      }
    }
  }

  private updatePrgBanks(): void {
    let value: number
    switch (this.prgMode) {
    case 0:
      value = (this.prgBanks[3] & -4) & this.maxPrg
      this.options.setPrgBank(0, value)
      this.options.setPrgBank(1, value + 1)
      this.options.setPrgBank(2, value + 2)
      this.options.setPrgBank(3, value + 3)
      break
    case 1:
      value = (this.prgBanks[1] & -2) & this.maxPrg
      this.options.setPrgBank(0, value)
      this.options.setPrgBank(1, value + 1)
      value = (this.prgBanks[3] & -2) & this.maxPrg
      this.options.setPrgBank(2, value)
      this.options.setPrgBank(3, value + 1)
      break
    case 2:
      value = (this.prgBanks[1] & -2) & this.maxPrg
      this.options.setPrgBank(0, value)
      this.options.setPrgBank(1, value + 1)
      this.options.setPrgBank(2, this.prgBanks[2] & this.maxPrg)
      this.options.setPrgBank(3, this.prgBanks[3] & this.maxPrg)
      break
    case 3:
      this.options.setPrgBank(0, this.prgBanks[0] & this.maxPrg)
      this.options.setPrgBank(1, this.prgBanks[1] & this.maxPrg)
      this.options.setPrgBank(2, this.prgBanks[2] & this.maxPrg)
      this.options.setPrgBank(3, this.prgBanks[3] & this.maxPrg)
      break
    default:
      break
    }
  }
}
