import {Cpu6502} from '../cpu.ts'
import {Ppu} from '../ppu.ts'
import {Util} from '../util.ts'

export function mapper02(romData: Uint8Array, cpu: Cpu6502, _ppu: Ppu) {
  const BANK_SIZE = 16 * 1024
  const size = romData.length
  const count = size / BANK_SIZE
  const lastBank = size - BANK_SIZE
  let prgBank = 0
  cpu.setReadMemory(0x8000, 0xbfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank])
  cpu.setReadMemory(0xc000, 0xffff,
                    (adr) => romData[(adr & (BANK_SIZE - 1)) + size - BANK_SIZE])

  // PRG ROM bank
  cpu.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
    prgBank = (value & (count - 1)) * BANK_SIZE
  })
}
