// VRC4e
// http://wiki.nesdev.com/w/index.php/INES_Mapper_023

import {Cpu6502} from '../cpu.ts'
import {Ppu} from '../ppu.ts'
import {Util} from '../util.ts'

export function mapper023(romData: Uint8Array, cpu: Cpu6502, ppu: Ppu) {
  const BANK_BIT = 14
  const BANK_SIZE = 1 << BANK_BIT
  const size = romData.length
  const count = size / BANK_SIZE
console.log(`size=${size}, count=${count}`)
  const kLastBank = size - BANK_SIZE
  let prgBankMode = 0
  let prgBank0 = 0, prgBank1 = 1 << BANK_BIT, prgBank2 = (count - 2) << BANK_BIT, prgBank3 = (count - 1) << BANK_BIT
  cpu.setReadMemory(0x8000, 0x9fff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank0])
  cpu.setReadMemory(0xa000, 0xbfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank1])
  cpu.setReadMemory(0xc000, 0xdfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank2])
  cpu.setReadMemory(0xe000, 0xffff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank3])

  // PRG ROM bank
  cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
    console.log(`Write ${Util.hex(adr, 4)}: ${Util.hex(value, 2)}`)
    if (0x8000 <= adr && adr <= 0x8006) {
      switch (prgBankMode) {
      case 0:
        prgBank0 = (value & (count - 1)) << BANK_BIT
console.log(`prgBank0: ${value}, ${Util.hex(prgBank0, 8)}, ${prgBankMode}`)
        break
      case 1:
        prgBank2 = (value & (count - 1)) << BANK_BIT
console.log(`prgBank2: ${value}, ${Util.hex(prgBank2, 8)}, ${prgBankMode}`)
        break
      }
    } else if ((adr & 0xfffb) === 0x9000) {  // 0x9000, 0x9002
      const mirrorMode = value & 3
console.log(`Mirror mode: ${mirrorMode}`)
      ppu.setMirrorMode(mirrorMode)
    } else if ((adr & 0xfffb) === 0x9008) {  // 0x9004, 0x9006
      prgBankMode = (value >> 1) & 1
console.log(`prgBankMode: ${prgBankMode}`)
      switch (prgBankMode) {
      case 0:
        prgBank2 = (count - 2) << BANK_BIT
        prgBank3 = (count - 1) << BANK_BIT
        break
      case 1:
        prgBank0 = (count - 2) << BANK_BIT
        prgBank3 = (count - 1) << BANK_BIT
        break
      }
    }
  })
  cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
    console.log(`Write ${Util.hex(adr, 4)}: ${Util.hex(value, 2)}`)
    if (0xa000 <= adr && adr <= 0xa006) {
      prgBank1 = (value & (count - 1)) << BANK_BIT
console.log(`prgBank1: ${value}, ${Util.hex(prgBank1, 8)}, ${prgBankMode}`)
    }
  })
  cpu.setWriteMemory(0xe000, 0xffff, (adr, value) => {
console.log(`Write ${Util.hex(adr, 4)}: ${Util.hex(value, 2)}`)
    // TODO: Implement.
  })

  // PRG RAM
  const ram = new Uint8Array(0x2000)
  ram.fill(0xff)
  cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
  cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
}
