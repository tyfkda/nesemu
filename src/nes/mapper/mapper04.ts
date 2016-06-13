import {Cpu6502} from '../cpu.ts'
import {Nes} from '../nes.ts'
import {Ppu} from '../ppu.ts'
import {Util} from '../util.ts'

export function mapper04(romData: Uint8Array, cpu: Cpu6502, ppu: Ppu, nes: Nes) {
  const maxPrg = (romData.length >> 13) - 1  // 0x2000
  let p0 = 0, p1 = 1, p2 = 2, p3 = maxPrg << 13
  const regs = new Uint8Array(8)
  const setPrgBank = (swap) => {
    if ((swap & 0x40) === 0) {
      p0 = (regs[6] & maxPrg) << 13
      p1 = (regs[7] & maxPrg) << 13
      p2 = (maxPrg - 1) << 13
    } else {
      p2 = (regs[6] & maxPrg) << 13
      p1 = (regs[7] & maxPrg) << 13
      p0 = (maxPrg - 1) << 13
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
  cpu.setReadMemory(0x8000, 0x9fff, (adr) => romData[(adr & 0x1fff) + p0])
  cpu.setReadMemory(0xa000, 0xbfff, (adr) => romData[(adr & 0x1fff) + p1])
  cpu.setReadMemory(0xc000, 0xdfff, (adr) => romData[(adr & 0x1fff) + p2])
  cpu.setReadMemory(0xe000, 0xffff, (adr) => romData[(adr & 0x1fff) + p3])

  // PRG RAM
  const ram = new Uint8Array(0x2000)
  ram.fill(0xff)
  cpu.setReadMemory(0x6000, 0x7fff, (adr) => ram[adr & 0x1fff])
  cpu.setWriteMemory(0x6000, 0x7fff, (adr, value) => { ram[adr & 0x1fff] = value })

  // Select
  let bankSelect = 0
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
      ppu.setMirrorMode(1 - (value & 1))
    } else {
      // PRG RAM protect, TODO: Implement.
      console.log(`RAM write protect: ${Util.hex(value, 2)}`)
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
  ppu.setMirrorMode(1)  // Default vertical mirroring?
}
