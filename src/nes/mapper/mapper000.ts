import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export function mapper000(romData: Uint8Array, cpu: Cpu, _ppu: Ppu) {
  // ROM
  cpu.setReadMemory(0x8000, 0xbfff, (adr) => romData[adr & (romData.length - 1)])
  cpu.setReadMemory(0xc000, 0xffff, (adr) => romData[adr & (romData.length - 1)])
}
