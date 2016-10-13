// MMC3

import {Cpu} from '../cpu'
import {Nes} from '../nes'
import {Ppu, MirrorMode} from '../ppu'

export function mapper004(romData: Uint8Array, cpu: Cpu, ppu: Ppu, nes: Nes) {
  const BANK_BIT = 13  // 0x2000
  const BANK_MASK = (1 << BANK_BIT) - 1
  const regs = new Uint8Array(8)
  const maxPrg = (romData.length >> BANK_BIT) - 1

  let bankSelect = 0
  let p0 = 0, p1 = 1 << BANK_BIT, p2 = 2 << BANK_BIT, p3 = maxPrg << BANK_BIT

  const setPrgBank = (swap) => {
    if ((swap & 0x40) === 0) {
      p0 = (regs[6] & maxPrg) << BANK_BIT
      p1 = (regs[7] & maxPrg) << BANK_BIT
      p2 = (maxPrg - 1) << BANK_BIT
    } else {
      p2 = (regs[6] & maxPrg) << BANK_BIT
      p1 = (regs[7] & maxPrg) << BANK_BIT
      p0 = (maxPrg - 1) << BANK_BIT
    }
  }
  const setChrBank = (swap) => {
    if ((swap & 0x80) === 0) {
      ppu.setChrBankOffset(0, regs[0] & 0xfe)
      ppu.setChrBankOffset(1, regs[0] | 1)
      ppu.setChrBankOffset(2, regs[1] & 0xfe)
      ppu.setChrBankOffset(3, regs[1] | 1)
      ppu.setChrBankOffset(4, regs[2])
      ppu.setChrBankOffset(5, regs[3])
      ppu.setChrBankOffset(6, regs[4])
      ppu.setChrBankOffset(7, regs[5])
    } else {
      ppu.setChrBankOffset(4, regs[0] & 0xfe)
      ppu.setChrBankOffset(5, regs[0] | 1)
      ppu.setChrBankOffset(6, regs[1] & 0xfe)
      ppu.setChrBankOffset(7, regs[1] | 1)
      ppu.setChrBankOffset(0, regs[2])
      ppu.setChrBankOffset(1, regs[3])
      ppu.setChrBankOffset(2, regs[4])
      ppu.setChrBankOffset(3, regs[5])
    }
  }

  // PRG ROM
  cpu.setReadMemory(0x8000, 0x9fff, (adr) => romData[(adr & BANK_MASK) + p0])
  cpu.setReadMemory(0xa000, 0xbfff, (adr) => romData[(adr & BANK_MASK) + p1])
  cpu.setReadMemory(0xc000, 0xdfff, (adr) => romData[(adr & BANK_MASK) + p2])
  cpu.setReadMemory(0xe000, 0xffff, (adr) => romData[(adr & BANK_MASK) + p3])

  // PRG RAM
  const ram = new Uint8Array(0x2000)
  ram.fill(0xff)
  cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
  cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })

  // Select
  cpu.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
    if ((adr & 1) === 0) {
      bankSelect = value
      setPrgBank(bankSelect)
      setChrBank(bankSelect)
    } else {
      const reg = bankSelect & 0x07
      regs[reg] = value
      if (reg < 6) {  // CHR
        setChrBank(bankSelect)
      } else {  // PRG
        setPrgBank(bankSelect)
      }
    }
  })

  // Mirroring
  cpu.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
    if ((adr & 1) === 0) {
      ppu.setMirrorMode((value & 1) === 0 ? MirrorMode.VERT : MirrorMode.HORZ)
    } else {
      // PRG RAM protect, TODO: Implement.
    }
  })

  // IRQ
  cpu.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
    if ((adr & 1) === 0) {
      nes.setIrqHlineValue(value)
    } else {
      // TODO: IRQ relaod
      nes.resetIrqHlineCounter()
    }
  })
  cpu.setWriteMemory(0xe000, 0xffff, (adr, value) => {
    if ((adr & 1) === 0) {
      nes.enableIrqHline(false)
      nes.resetIrqHlineCounter()
    } else {
      nes.enableIrqHline(true)
    }
  })

  setPrgBank(bankSelect)  // Initial

  // http://wiki.nesdev.com/w/index.php/INES#Flags_6
  // iNes header, flags 6
  // > Some mappers, such as MMC1, MMC3, and AxROM, can control nametable mirroring.
  // > They ignore bit 0
  ppu.setMirrorMode(MirrorMode.VERT)  // Default vertical mirroring?
}
