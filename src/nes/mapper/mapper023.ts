// VRC4e
// http://wiki.nesdev.com/w/index.php/INES_Mapper_023

import {Mapper} from './mapper'
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

  constructor(romData: Uint8Array, private cpu: Cpu, private ppu: Ppu, mapping: {[key: number]: number}) {
    super()

    const BANK_BIT = 13
    const BANK_SIZE = 1 << BANK_BIT
    const size = romData.length
    const count = size / BANK_SIZE
    let prgBankMode = 0
    let prgBank0 = 0, prgBank1 = 1 << BANK_BIT, prgBank2 = (count - 2) << BANK_BIT
    const prgBank3 = (count - 1) << BANK_BIT
    const chrBank = new Array(8)

    cpu.setReadMemory(0x8000, 0x9fff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank0])
    cpu.setReadMemory(0xa000, 0xbfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank1])
    cpu.setReadMemory(0xc000, 0xdfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank2])
    cpu.setReadMemory(0xe000, 0xffff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank3])

    // PRG ROM bank
    cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (0x8000 <= adr && adr <= 0x8006) {
        switch (prgBankMode) {
        case 0:
          prgBank0 = (value & (count - 1)) << BANK_BIT
          break
        case 1:
          prgBank2 = (value & (count - 1)) << BANK_BIT
          break
        }
      } else if ((adr & 0xff00) === 0x9000) {
        const low = adr & 0xff
        if (low === mapping[0] || low === mapping[2]) {  // Mirroring Control.
          const mirrorMode = value & 3
          ppu.setMirrorMode(kMirrorTable[mirrorMode])
        } else if (low === mapping[4] || low === mapping[6]) {  // PRG Swap Mode control.
          prgBankMode = (value >> 1) & 1
          switch (prgBankMode) {
          case 0:
            prgBank2 = (count - 2) << BANK_BIT
            break
          case 1:
            prgBank0 = (count - 2) << BANK_BIT
            break
          }
        }
      }
    })
    cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if (0xa000 <= adr && adr <= 0xa006) {
        prgBank1 = (value & (count - 1)) << BANK_BIT
      } else if ((adr & 0xff00) === 0xb000) {
        const low = adr & 0xff
        if (low === mapping[0]) {  // CHR Select 0
          chrBank[0] = (chrBank[0] & ~0x0f) | (value & 0x0f)
          ppu.setChrBankOffset(0, chrBank[0])
        } else if (low === mapping[2]) {
          chrBank[0] = (chrBank[0] & ~0x1f0) | ((value & 0x1f) << 4)
          ppu.setChrBankOffset(0, chrBank[0])
        } else if (low === mapping[4]) {  // CHR Select 1
          chrBank[1] = (chrBank[1] & ~0x0f) | (value & 0x0f)
          ppu.setChrBankOffset(1, chrBank[1])
        } else if (low === mapping[6]) {
          chrBank[1] = (chrBank[1] & ~0x1f0) | ((value & 0x1f) << 4)
          ppu.setChrBankOffset(1, chrBank[1])
        }
      }
    })
    cpu.setWriteMemory(0xc000, 0xffff, (adr, value) => {
      if (0xc000 <= adr && adr <= 0xefff) {  // CHR Select 2...7
        const low = adr & 0xff
        let ofs = 0, hi = false
        if (low === mapping[0]) {
          ofs = 0
        } else if (low === mapping[2]) {
          ofs = 0
          hi = true
        } else if (low === mapping[4]) {
          ofs = 1
        } else if (low === mapping[6]) {
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
        const low = adr & 0xff
        if (low === mapping[0]) {  // IRQ Latch: low 4 bits
          this.irqLatch = (this.irqLatch & ~0x0f) | (value & 0x0f)
        } else if (low === mapping[2]) {  // IRQ Latch: high 4 bits
          this.irqLatch = (this.irqLatch & ~0xf0) | ((value & 0x0f) << 4)
        } else if (low === mapping[4]) {  // IRQ Control
          this.irqControl = value
          if ((this.irqControl & IRQ_ENABLE) !== 0) {
            this.irqCounter = this.irqLatch
          }
        } else if (low === mapping[6]) {  // IRQ Acknowledge
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
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super(romData, cpu, ppu, {
      0: 0,
      2: 4,
      4: 8,
      6: 0xc,
    })
  }
}

export class Mapper025 extends Mapper023Base {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super(romData, cpu, ppu, {
      0: 0,
      2: 2,
      4: 1,
      6: 3,
    })
  }
}
