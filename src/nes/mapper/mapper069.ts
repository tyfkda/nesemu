// Sunsoft FME-7

import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'

const kMirrorTable = [
  MirrorMode.VERT, MirrorMode.HORZ, MirrorMode.SINGLE0, MirrorMode.SINGLE1,
]

export class Mapper069 extends Mapper {
  public static create(options: MapperOptions): Mapper {
    return new Mapper069(options)
  }

  constructor(private options: MapperOptions) {
    super()

    // const BANK_BIT = 13
    // const count = prgSize >> BANK_BIT

    // CHR ROM bank
    let command = 0
    this.options.bus.setWriteMemory(0x8000, 0x9fff, (_adr, value) => {
      command = value & 0x0f
    })
    this.options.bus.setWriteMemory(0xa000, 0xbfff, (_adr, value) => {
      switch (command) {
      case 0x00: case 0x01: case 0x02: case 0x03:
      case 0x04: case 0x05: case 0x06: case 0x07:
        this.options.ppu.setChrBankOffset(command, value)
        break
      case 0x09:
      case 0x0a:
      case 0x0b:
        this.options.prgBankCtrl.setPrgBank(command - 9, value)
        break
      case 0x0c:
        {
          this.options.ppu.setMirrorMode(kMirrorTable[value & 3])
        }
        break
      }
    })

    // PRG RAM
    const ram = new Uint8Array(0x2000)
    ram.fill(0xbf)
    this.options.bus.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
    this.options.bus.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
  }
}
