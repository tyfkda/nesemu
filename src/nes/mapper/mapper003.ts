import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export function mapper003(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
  // ROM
  cpu.setReadMemory(0x8000, 0xffff, (adr) => romData[adr & (romData.length - 1)])

  // Chr ROM bank
  cpu.setWriteMemory(0x8000, 0xffff, (adr, value) => {
    ppu.setChrBank(value)
  })
}

export function mapper185(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
  ppu.writePpuDirect(0x0000, 1)  // For "Mighty bomb jack(J)"
  return mapper003(romData, cpu, ppu)
}
