// VRC6
// http://wiki.nesdev.com/w/index.php/VRC6

import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu'
import Util from '../../util/util'

const IRQ_ENABLE_AFTER = 1 << 0
const IRQ_ENABLE = 1 << 1
const IRQ_MODE = 1 << 2

const kMirrorTable = [MirrorMode.VERT, MirrorMode.HORZ, MirrorMode.SINGLE0, MirrorMode.SINGLE1]

const kChrBankTable = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [0, 0, 1, 1, 2, 2, 3, 3],
  [0, 1, 2, 3, 4, 4, 5, 5],
  [0, 1, 2, 3, 4, 4, 5, 5],
]

class Mapper024Base extends Mapper {
  private ram = new Uint8Array(0x2000)
  private chrRegs = new Uint8Array(8)
  private prgCount = 0
  private prgBank = 0
  private ppuBankMode = 0
  private mirrorMode = 0
  private irqControl: number = 0
  private irqLatch: number = 0
  private irqCounter: number = 0

  constructor(private options: MapperOptions, mapping: {[key: number]: number}) {
    super()

    const BANK_BIT = 13
    this.prgCount = options.prgSize >> BANK_BIT
    this.options.prgBankCtrl.setPrgBank(0, 0)
    this.options.prgBankCtrl.setPrgBank(1, 1)
    this.setPrgBank(this.prgCount - 2)

    // PRG ROM bank
    this.options.bus.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (0x8000 <= adr && adr <= 0x8003) {
        this.setPrgBank((value & (this.prgCount / 2 - 1)) << 1)
      }
    })
    this.options.bus.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if (0xc000 <= adr && adr <= 0xc003) {
        this.options.prgBankCtrl.setPrgBank(2, value)
      }
    })

    // CHR ROM bank
    const b003 = 0xb000 | mapping[3]
    this.options.bus.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if ((adr & 0xf0ff) === b003) {
        this.ppuBankMode = value & 3
        this.setChrBank()

        this.mirrorMode = (value >> 2) & 3
        this.options.ppu.setMirrorMode(kMirrorTable[this.mirrorMode])
      }
    })
    this.options.bus.setWriteMemory(0xd000, 0xffff, (adr, value) => {
      if (0xd000 <= adr && adr <= 0xefff) {
        const high = ((adr - 0xd000) >> 10) & 4
        const low = adr & 0x0f
        if (low < 4) {
          const reg = mapping[low] + high
          this.chrRegs[reg] = value
          this.setChrBank()
        }
      } else {
        const low = adr & 0xff
        switch (low) {
        case 0:  // IRQ Latch: low 4 bits
          this.irqLatch = value
          break
        case 1:  // IRQ Control
          this.irqControl = value
          if ((this.irqControl & IRQ_ENABLE) !== 0) {
            this.irqCounter = this.irqLatch
          }
          break
        case 2:  // IRQ Acknowledge
          // Copy to enable
          const ea = this.irqControl & IRQ_ENABLE_AFTER
          this.irqControl = (this.irqControl & ~IRQ_ENABLE) | (ea << 1)
          break
        default:
          break
        }
      }
    })

    // PRG RAM
    this.ram.fill(0xff)
    this.options.bus.setReadMemory(0x6000, 0x7fff, (adr) => this.ram[adr & 0x1fff])
    this.options.bus.setWriteMemory(0x6000, 0x7fff, (adr, value) => { this.ram[adr & 0x1fff] = value })
  }

  public reset() {
    this.irqControl = 0
    this.irqLatch = this.irqCounter = 0
  }

  public save(): object {
    return {
      ram: Util.convertUint8ArrayToBase64String(this.ram),
      chrRegs: Util.convertUint8ArrayToBase64String(this.chrRegs),
      prgCount: this.prgCount,
      prgBank: this.prgBank,
      ppuBankMode: this.ppuBankMode,
      mirrorMode: this.mirrorMode,
      irqControl: this.irqControl,
      irqLatch: this.irqLatch,
      irqCounter: this.irqCounter,
    }
  }

  public load(saveData: any): void {
    this.ram = Util.convertBase64StringToUint8Array(saveData.ram)
    this.chrRegs = Util.convertBase64StringToUint8Array(saveData.chrRegs)
    this.prgCount = saveData.prgCount
    // this.prgBank = saveData.prgBank
    this.ppuBankMode = saveData.ppuBankMode
    this.mirrorMode = saveData.mirrorMode
    this.irqControl = saveData.irqControl
    this.irqLatch = saveData.irqLatch
    this.irqCounter = saveData.irqCounter

    this.setPrgBank(saveData.prgBank)
    this.setChrBank()
  }

  public onHblank(hcount: number): void {
    if ((this.irqControl & IRQ_ENABLE) !== 0) {
      let c = this.irqCounter
      if ((this.irqControl & IRQ_MODE) === 0) {  // scanline mode
        c += 1
      } else {  // cycle mode
        c += 185  // TODO: Calculate.
      }
      if (c >= 255) {
        c = this.irqLatch
        this.options.cpu.requestIrq()
      }
      this.irqCounter = c
    }
  }

  private setPrgBank(prgBank: number) {
    this.prgBank = prgBank
    this.options.prgBankCtrl.setPrgBank(0, prgBank)
    this.options.prgBankCtrl.setPrgBank(1, prgBank + 1)
  }

  private setChrBank() {
    const table = kChrBankTable[this.ppuBankMode]
    for (let i = 0; i < 8; ++i)
      this.options.ppu.setChrBankOffset(i, this.chrRegs[table[i]])
  }
}

export class Mapper024 extends Mapper024Base {
  public static create(options: MapperOptions): Mapper {
    return new Mapper024(options)
  }

  constructor(options: MapperOptions) {
    super(options, {
      0: 0,
      1: 1,
      2: 2,
      3: 3,
    })
  }
}

export class Mapper026 extends Mapper024Base {
  public static create(options: MapperOptions): Mapper {
    return new Mapper026(options)
  }

  constructor(options: MapperOptions) {
    super(options, {
      0: 0,
      1: 2,
      2: 1,
      3: 3,
    })
  }
}
