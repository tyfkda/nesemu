import {Mapper} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export class Mapper087 extends Mapper {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super()
    // ROM
    cpu.setReadMemory(0x8000, 0xbfff, (adr) => romData[adr & (romData.length - 1)])
    cpu.setReadMemory(0xc000, 0xffff, (adr) => romData[adr & (romData.length - 1)])

    // PRG ROM bank
    cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => {
      const bank = ((value & 2) >> 1) | ((value & 1) << 1)
      ppu.setChrBank(bank)
    })
  }
}
