// Irem's G-101

import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'

const kMirrorTable = [MirrorMode.VERT, MirrorMode.HORZ]

export class Mapper032 extends Mapper {
  public static create(options: MapperOptions): Mapper {
    return new Mapper032(options)
  }

  constructor(private options: MapperOptions) {
    super()

    const BANK_BIT = 13  // 0x2000
    const maxPrg = (options.prgSize >> BANK_BIT) - 1
    const kLast2Bank = maxPrg - 1

    let prgReg = [0, 1 << BANK_BIT]
    let prgMode = 0

    const setPrgBank = () => {
      let p0, p1, p2
      if (prgMode === 0) {
        p0 = prgReg[0]
        p1 = prgReg[1]
        p2 = kLast2Bank
      } else {
        p2 = prgReg[0]
        p1 = prgReg[1]
        p0 = kLast2Bank
      }
      this.options.prgBankCtrl.setPrgBank(0, p0)
      this.options.prgBankCtrl.setPrgBank(1, p1)
      this.options.prgBankCtrl.setPrgBank(2, p2)
    }

    // PRG RAM
    const ram = new Uint8Array(0x2000)
    ram.fill(0xbf)
    this.options.bus.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
    this.options.bus.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })

    // Select
    this.options.bus.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (adr <= 0x8fff) {
        prgReg[0] = value
        setPrgBank()
      } else {
        this.options.ppu.setMirrorMode(kMirrorTable[value & 1])
        prgMode = (value >> 1) & 1
        setPrgBank()
      }
    })
    this.options.bus.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if (adr <= 0xafff) {
        prgReg[1] = value
        setPrgBank()
      } else {
        this.options.ppu.setChrBankOffset(adr & 7, value)
      }
    })
  }
}
