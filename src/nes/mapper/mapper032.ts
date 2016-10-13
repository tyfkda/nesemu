// Irem's G-101

import {Cpu} from '../cpu'
import {Nes} from '../nes'
import {Ppu, MirrorMode} from '../ppu'

const kMirrorTable = [MirrorMode.VERT, MirrorMode.HORZ]

export function mapper032(romData: Uint8Array, cpu: Cpu, ppu: Ppu, nes: Nes) {
  const BANK_BIT = 13  // 0x2000
  const BANK_MASK = (1 << BANK_BIT) - 1
  const maxPrg = (romData.length >> BANK_BIT) - 1
  const kLast2Bank = (maxPrg - 1) << BANK_BIT

  let p0 = 0, p1 = 1 << BANK_BIT, p2 = (maxPrg - 1) << BANK_BIT, p3 = maxPrg << BANK_BIT
  let prgReg = [0, 1 << BANK_BIT]
  let prgMode = 0

  const setPrgBank = () => {
    if (prgMode === 0) {
      p0 = prgReg[0]
      p1 = prgReg[1]
      p2 = kLast2Bank
    } else {
      p2 = prgReg[0]
      p1 = prgReg[1]
      p0 = kLast2Bank
    }
  }

  // PRG ROM
  cpu.setReadMemory(0x8000, 0x9fff, (adr) => romData[(adr & BANK_MASK) + p0])
  cpu.setReadMemory(0xa000, 0xbfff, (adr) => romData[(adr & BANK_MASK) + p1])
  cpu.setReadMemory(0xc000, 0xdfff, (adr) => romData[(adr & BANK_MASK) + p2])
  cpu.setReadMemory(0xe000, 0xffff, (adr) => romData[(adr & BANK_MASK) + p3])

  // PRG RAM
  const ram = new Uint8Array(0x2000)
  ram.fill(0xbf)
  cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
  cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })

  // Select
  cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
    if (adr <= 0x8fff) {
      prgReg[0] = (value & maxPrg) << BANK_BIT
      setPrgBank()
    } else {
      ppu.setMirrorMode(kMirrorTable[value & 1])
      prgMode = (value >> 1) & 1
      setPrgBank()
    }
  })
  cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
    if (adr <= 0xafff) {
      prgReg[1] = (value & maxPrg) << BANK_BIT
      setPrgBank()
    } else {
      ppu.setChrBankOffset(adr & 7, value)
    }
  })
}
