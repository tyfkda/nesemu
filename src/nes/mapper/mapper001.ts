// MMC1

import {Cpu} from '../cpu.ts'
import {Ppu, MirrorMode} from '../ppu.ts'

export function mapper001(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
  const BANK_BIT = 14  // 16KB
  const BANK_SIZE = 1 << BANK_BIT
  const size = romData.length
  const maxPrg = (romData.length >> BANK_BIT) - 1

  let register = 0
  let counter = 0
  let prgBankMode = 3, prgBank = [0, size - BANK_SIZE]
  let chrBank4k = true
  let chrBank = [0 << 2, 1 << 2]

  const resetRegister = () => {
    register = 0
    counter = 0
  }

  const setChrBank = (hilo, bank) => {
    if (chrBank4k) {
      const chr = hilo << 2
      for (let i = 0; i < 4; ++i)
        ppu.setChrBankOffset(chr + i, bank + i)
    } else {
      if (hilo === 0) {
        bank = bank & -8
        for (let i = 0; i < 8; ++i)
          ppu.setChrBankOffset(i, bank + i)
      }
    }
    chrBank[hilo] = bank
  }

  const setPrgBank = (register, chrBank0) => {
    register &= 0x0f
    let bank = register & maxPrg
    switch (prgBankMode) {
    case 0: case 1:
      bank = (bank | ((chrBank0 >> 2) & 0x10)) & maxPrg
      prgBank[0] = (bank & ~1) << BANK_BIT
      prgBank[1] = (bank | 1) << BANK_BIT
      break
    case 2:
      prgBank[0] = 0
      prgBank[1] = bank << BANK_BIT
      break
    case 3:
      prgBank[0] = bank << BANK_BIT
      prgBank[1] = size - BANK_SIZE
      break
    default:
      break
    }
  }

  // PRG ROM
  cpu.setReadMemory(0x8000, 0xffff, (adr) => {
    const hi = (adr >> BANK_BIT) & 1
    const lo = adr & 0x3fff
    return romData[prgBank[hi] + lo]
  })

  // Serial: 5bits.
  cpu.setWriteMemory(0x8000, 0xffff, (adr, value) => {
    if ((value & 0x80) !== 0)  // Reset
      return resetRegister()

    register |= ((value & 1) << counter)
    if (++counter < 5)
      return

    // Register filled: branch according to bit 13~14.
    switch (adr & 0xe000) {
    case 0x8000:  // Controll
      {
        const mirrorMode = register & 3
        switch (mirrorMode) {
        case 0:
          ppu.setMirrorMode(MirrorMode.SINGLE0)
          break
        case 1:
          ppu.setMirrorMode(MirrorMode.SINGLE1)
          break
        case 2:
          ppu.setMirrorMode(MirrorMode.VERT)
          break
        case 3:
          ppu.setMirrorMode(MirrorMode.HORZ)
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

        const newChrBank4k = (register & 0x10) !== 0
        if (chrBank4k !== newChrBank4k) {
          chrBank4k = newChrBank4k
          setChrBank(0, chrBank[0])
          setChrBank(1, chrBank[1])
        }
      }
      break
    case 0xa000: case 0xc000:  // CHR bank
      {
        const hilo = ((adr - 0xa000) >> 13) & 1
        const bank = (register & 0x1f) << 2
        if (chrBank[hilo] !== bank)
          setChrBank(hilo, bank)

        if (hilo === 0 && prgBankMode < 2)
          setPrgBank(prgBank[0] >> BANK_BIT, chrBank[0])
      }
      break
    case 0xe000:  // PRG bank
      setPrgBank(register, chrBank[0])
      break
    default:
      break
    }
    resetRegister()
  })

  // PRG RAM
  const ram = new Uint8Array(0x2000)
  ram.fill(0xff)
  cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
  cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
}
