// MMC1

import {Cpu6502} from '../cpu.ts'
import {Ppu} from '../ppu.ts'
import {Util} from '../util.ts'

export function mapper01(romData: Uint8Array, cpu: Cpu6502, ppu: Ppu) {
  const BANK_SIZE = 1 << 14  // 16KB
  const size = romData.length

  let register = 0x10
  let prgBankMode = 3, prgBank = [0, size - BANK_SIZE]

  const resetRegister = () => {
    register = 0x10
  }

  // PRG ROM
  cpu.setReadMemory(0x8000, 0xffff, (adr) => {
    const hi = (adr >> 14) & 1
    const lo = adr & 0x3fff
    return romData[prgBank[hi] + lo]
  })

  // Serial: 5bits.
  cpu.setWriteMemory(0x8000, 0xffff, (adr, value) => {
    if ((value & 0x80) !== 0)  // Reset
      return resetRegister()

    const filled = (register & 1) !== 0
    register = (register >> 1) | ((value & 1) << 4)
    if (!filled)
      return

    // Register filled: branch according to bit 13~14.
    switch (adr & 0xe000) {
    case 0x8000:  // Controll
      {
        const mirrorMode = register & 3
        switch (mirrorMode) {
        case 2:
          ppu.setMirrorMode(1)
          break
        case 3:
          ppu.setMirrorMode(0)
          break
        }

        prgBankMode = (register >> 2) & 3
        switch (prgBankMode) {
        case 2:
          prgBank[0] = 0
          break
        case 3:
          prgBank[1] = size - BANK_SIZE
          break
        default:
          break
        }
      }
      break
    case 0xa000: case 0xc000:  // CHR bank
      {
        const bank = ((adr - 0xa000) & 0x2000) >> 1  // 0x1000
        for (let i = 0; i < 4; ++i)
          ppu.setChrBankOffset(bank + i, value + i)
      }
      break
    case 0xe000:  // PRG bank
      {
        const bank = register & 0x0f
        switch (prgBankMode) {
        case 0: case 1:
          prgBank[0] = (bank & ~1) << 14
          prgBank[1] = (bank | 1) << 14
          break
        case 2:
          prgBank[1] = bank << 14
          break
        case 3:
          prgBank[0] = bank << 14
          break
        default:
          break
        }
      }
      break
    default:
      break
    }
    resetRegister()
  })

  // PRG RAM
  const ram = new Uint8Array(0x2000)
  cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
  cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
}
