// VRC6
// http://wiki.nesdev.com/w/index.php/VRC6

import {Cpu} from '../cpu.ts'
import {Ppu, MirrorMode} from '../ppu.ts'
import {Util} from '../util.ts'

const kMirrorTable = [MirrorMode.VERT, MirrorMode.HORZ, MirrorMode.SINGLE0, MirrorMode.SINGLE1]

function create(mapping) {
  return function(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    const BANK_BIT = 13
    const BANK_SIZE = 1 << BANK_BIT
    const size = romData.length
    const count = size / BANK_SIZE
    let prgBankMode = 0
    let prgBank0 = 0, prgBank2 = (count - 2) << BANK_BIT
    const prgBank3 = (count - 1) << BANK_BIT
    cpu.setReadMemory(0x8000, 0xbfff, (adr) => romData[(adr & (BANK_SIZE * 2 - 1)) + prgBank0])
    cpu.setReadMemory(0xc000, 0xdfff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank2])
    cpu.setReadMemory(0xe000, 0xffff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank3])

    // PRG ROM bank
    cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (0x8000 <= adr && adr <= 0x8003) {
        prgBank0 = (value & (count / 2 - 1)) << (BANK_BIT + 1)
      }
    })
    cpu.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if (0xc000 <= adr && adr <= 0xc003) {
        prgBank2 = (value & (count - 1)) << BANK_BIT
      }
    })

    let ppuBankMode = 0
    let mirrorMode = 0
    let chrRegs = new Uint8Array(8)
    const setChrBank = () => {
      switch (ppuBankMode) {
      case 0:
        ppu.setChrBankOffset(0, chrRegs[0])
        ppu.setChrBankOffset(1, chrRegs[1])
        ppu.setChrBankOffset(2, chrRegs[2])
        ppu.setChrBankOffset(3, chrRegs[3])
        ppu.setChrBankOffset(4, chrRegs[4])
        ppu.setChrBankOffset(5, chrRegs[5])
        ppu.setChrBankOffset(6, chrRegs[6])
        ppu.setChrBankOffset(7, chrRegs[7])
        break
      case 1:
        ppu.setChrBankOffset(0, chrRegs[0])
        ppu.setChrBankOffset(1, chrRegs[0])
        ppu.setChrBankOffset(2, chrRegs[1])
        ppu.setChrBankOffset(3, chrRegs[1])
        ppu.setChrBankOffset(4, chrRegs[2])
        ppu.setChrBankOffset(5, chrRegs[2])
        ppu.setChrBankOffset(6, chrRegs[3])
        ppu.setChrBankOffset(7, chrRegs[3])
        break
      case 2:
      case 3:
        ppu.setChrBankOffset(0, chrRegs[0])
        ppu.setChrBankOffset(1, chrRegs[1])
        ppu.setChrBankOffset(2, chrRegs[2])
        ppu.setChrBankOffset(3, chrRegs[3])
        ppu.setChrBankOffset(4, chrRegs[4])
        ppu.setChrBankOffset(5, chrRegs[4])
        ppu.setChrBankOffset(6, chrRegs[5])
        ppu.setChrBankOffset(7, chrRegs[5])
        break
      }
    }
    // CHR ROM bank
    cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if ((adr & 0xf000) === 0xb000 && (adr & 0xff) === mapping[3]) {
        // PPU Banking Style
        ppuBankMode = value & 3
        mirrorMode = (value >> 2) & 3
        ppu.setMirrorMode(kMirrorTable[mirrorMode])
      }
    })
    cpu.setWriteMemory(0xd000, 0xffff, (adr, value) => {
      if (0xd000 <= adr && adr <= 0xefff) {
        const low = adr & 0x0f
        if (low < 4) {
          chrRegs[mapping[low]] = value
          setChrBank()
        }
      }
    })

    // PRG RAM
    const ram = new Uint8Array(0x2000)
    ram.fill(0xff)
    cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
    cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })
  }
}

export const mapper024 = create({
  0: 0,
  1: 1,
  2: 2,
  3: 3,
})
