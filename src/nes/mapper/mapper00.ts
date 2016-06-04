import {Cpu6502} from '../cpu.ts'
import {Ppu} from '../ppu.ts'

export function mapper00(romData: Uint8Array, cpu: Cpu6502, _ppu: Ppu) {
  // ROM
  cpu.setReadMemory(0x8000, 0xbfff, (adr) => romData[adr & (romData.length - 1)])
  cpu.setReadMemory(0xc000, 0xffff, (adr) => romData[adr & (romData.length - 1)])
}
