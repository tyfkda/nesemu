// VRC4e
// http://wiki.nesdev.com/w/index.php/INES_Mapper_023

import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

const IRQ_ENABLE_AFTER = 1 << 0
const IRQ_ENABLE = 1 << 1
const IRQ_MODE = 1 << 2

const kMirrorTable = [MirrorMode.VERT, MirrorMode.HORZ, MirrorMode.SINGLE0, MirrorMode.SINGLE1]

class Mapper023Base extends Mapper {
  private irqControl: number = 0
  private irqLatch: number = 0
  private irqCounter: number = 0

  constructor(prgBankCtrl: PrgBankController, prgSize: number, private cpu: Cpu, private ppu: Ppu,
              mapping: {[key: number]: number})
  {
    super()

    const BANK_BIT = 13
    const count = prgSize >> BANK_BIT
    let prgBankMode = 0
    const chrBank = new Array(8)

    prgBankCtrl.setPrgBank(0, 0)
    prgBankCtrl.setPrgBank(1, 1)
    prgBankCtrl.setPrgBank(2, count - 2)
    prgBankCtrl.setPrgBank(3, count - 1)

    // PRG ROM bank
    cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (0x8000 <= adr && adr <= 0x8006) {
        switch (prgBankMode) {
        case 0:
          prgBankCtrl.setPrgBank(0, value)
          break
        case 1:
          prgBankCtrl.setPrgBank(2, value)
          break
        }
      } else if ((adr & 0xff00) === 0x9000) {
        const reg = mapping[adr & 0xff]
        if (reg === 0 || reg === 2) {  // Mirroring Control.
          const mirrorMode = value & 3
          ppu.setMirrorMode(kMirrorTable[mirrorMode])
        } else if (reg === 4 || reg === 6) {  // PRG Swap Mode control.
          prgBankMode = (value >> 1) & 1
          switch (prgBankMode) {
          case 0:
            prgBankCtrl.setPrgBank(2, count - 2)
            break
          case 1:
            prgBankCtrl.setPrgBank(0, count - 2)
            break
          }
        }
      }
    })
    cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if (0xa000 <= adr && adr <= 0xa006) {
        prgBankCtrl.setPrgBank(1, value & (count - 1))
      } else if ((adr & 0xff00) === 0xb000) {
        const reg = mapping[adr & 0xff]
        if (reg === 0) {  // CHR Select 0
          chrBank[0] = (chrBank[0] & ~0x0f) | (value & 0x0f)
          ppu.setChrBankOffset(0, chrBank[0])
        } else if (reg === 2) {
          chrBank[0] = (chrBank[0] & ~0x1f0) | ((value & 0x1f) << 4)
          ppu.setChrBankOffset(0, chrBank[0])
        } else if (reg === 4) {  // CHR Select 1
          chrBank[1] = (chrBank[1] & ~0x0f) | (value & 0x0f)
          ppu.setChrBankOffset(1, chrBank[1])
        } else if (reg === 6) {
          chrBank[1] = (chrBank[1] & ~0x1f0) | ((value & 0x1f) << 4)
          ppu.setChrBankOffset(1, chrBank[1])
        }
      }
    })
    cpu.setWriteMemory(0xc000, 0xffff, (adr, value) => {
      if (0xc000 <= adr && adr <= 0xefff) {  // CHR Select 2...7
        const reg = mapping[adr & 0xff]
        let ofs = 0, hi = false
        if (reg === 0) {
          ofs = 0
        } else if (reg === 2) {
          ofs = 0
          hi = true
        } else if (reg === 4) {
          ofs = 1
        } else if (reg === 6) {
          ofs = 1
          hi = true
        } else {
          return
        }
        const bank = ((adr & 0x3000) >> 11) + 2 + ofs
        if (hi)
          chrBank[bank] = (chrBank[bank] & ~0x1f0) | ((value & 0x1f) << 4)
        else
          chrBank[bank] = (chrBank[bank] & ~0x0f) | (value & 0x0f)
        ppu.setChrBankOffset(bank, chrBank[bank])
      } else {  // IRQ
        const reg = mapping[adr & 0xff]
        if (reg === 0) {  // IRQ Latch: low 4 bits
          this.irqLatch = (this.irqLatch & ~0x0f) | (value & 0x0f)
        } else if (reg === 2) {  // IRQ Latch: high 4 bits
          this.irqLatch = (this.irqLatch & ~0xf0) | ((value & 0x0f) << 4)
        } else if (reg === 4) {  // IRQ Control
          this.irqControl = value
          if ((this.irqControl & IRQ_ENABLE) !== 0) {
            this.irqCounter = this.irqLatch
          }
        } else if (reg === 6) {  // IRQ Acknowledge
          // Copy to enable
          const ea = this.irqControl & IRQ_ENABLE_AFTER
          this.irqControl = (this.irqControl & ~IRQ_ENABLE) | (ea << 1)
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
      if (c > 255) {
        c = this.irqLatch
        this.cpu.requestIrq()
      }
      this.irqCounter = c
    }
  }
}

export class Mapper023 extends Mapper023Base {
  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super(prgBankCtrl, prgSize, cpu, ppu, {
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
  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super(prgBankCtrl, prgSize, cpu, ppu, {
      0: 0,
      1: 4,
      2: 2,
      3: 6,
    })
  }
}
