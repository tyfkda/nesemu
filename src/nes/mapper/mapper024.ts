// VRC6
// http://wiki.nesdev.com/w/index.php/VRC6

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

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
  private irqControl: number = 0
  private irqLatch: number = 0
  private irqCounter: number = 0

  constructor(prgBankCtrl: PrgBankController, prgSize: number, private cpu: Cpu, ppu: Ppu,
              mapping: {[key: number]: number})
  {
    super()

    const BANK_BIT = 13
    const count = prgSize >> BANK_BIT
    prgBankCtrl.setPrgBank(0, 0)
    prgBankCtrl.setPrgBank(1, 1)
    prgBankCtrl.setPrgBank(2, count - 2)
    prgBankCtrl.setPrgBank(3, count - 1)

    // PRG ROM bank
    cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (0x8000 <= adr && adr <= 0x8003) {
        const bank = (value & (count / 2 - 1)) << 1
        prgBankCtrl.setPrgBank(0, bank)
        prgBankCtrl.setPrgBank(1, bank + 1)
      }
    })
    cpu.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if (0xc000 <= adr && adr <= 0xc003) {
        prgBankCtrl.setPrgBank(2, value)
      }
    })

    let ppuBankMode = 0
    let mirrorMode = 0
    let chrRegs = new Uint8Array(8)
    const setChrBank = () => {
      const table = kChrBankTable[ppuBankMode]
      for (let i = 0; i < 8; ++i)
        ppu.setChrBankOffset(i, chrRegs[table[i]])
    }
    // CHR ROM bank
    const b003 = 0xb000 | mapping[3]
    cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if ((adr & 0xf0ff) === b003) {
        ppuBankMode = value & 3
        setChrBank()

        mirrorMode = (value >> 2) & 3
        ppu.setMirrorMode(kMirrorTable[mirrorMode])
      }
    })
    cpu.setWriteMemory(0xd000, 0xffff, (adr, value) => {
      if (0xd000 <= adr && adr <= 0xefff) {
        const high = ((adr - 0xd000) >> 10) & 4
        const low = adr & 0x0f
        if (low < 4) {
          const reg = mapping[low] + high
          chrRegs[reg] = value
          setChrBank()
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
    const ram = new Uint8Array(0x2000)
    ram.fill(0xff)
    cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
    cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
  }

  public reset() {
    this.irqControl = 0
    this.irqLatch = this.irqCounter = 0
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
        this.cpu.requestIrq()
      }
      this.irqCounter = c
    }
  }
}

export class Mapper024 extends Mapper024Base {
  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super(prgBankCtrl, prgSize, cpu, ppu, {
      0: 0,
      1: 1,
      2: 2,
      3: 3,
    })
  }
}

export class Mapper026 extends Mapper024Base {
  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super(prgBankCtrl, prgSize, cpu, ppu, {
      0: 0,
      1: 2,
      2: 1,
      3: 3,
    })
  }
}
