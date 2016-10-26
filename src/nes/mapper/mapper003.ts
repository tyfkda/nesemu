import {Mapper} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export class Mapper003 extends Mapper {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super()
    // ROM
    cpu.setReadMemory(0x8000, 0xffff, (adr) => romData[adr & (romData.length - 1)])

    // Chr ROM bank
    cpu.setWriteMemory(0x8000, 0xffff, (adr, value) => {
      ppu.setChrBank(value)
    })
  }
}

export class Mapper185 extends Mapper003  {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super(romData, cpu, ppu)
    ppu.writePpuDirect(0x0000, 1)  // For "Mighty bomb jack(J)"
  }
}
