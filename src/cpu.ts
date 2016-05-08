import {Util} from './util.ts'

declare var process: any

const hex = Util.hex

function setReset(p, flag, mask) {
  if (flag)
    return p | mask
  return p & ~mask
}

function inc8(value) {
  return (value + 1) & 0xff
}

function dec8(value) {
  return (value - 1) & 0xff
}

const CARRY_BIT = 0
const ZERO_BIT = 1
const IRQBLK_BIT = 2
const DECIMAL_BIT = 3
const BREAK_BIT = 4
const RESERVED_BIT = 5
const OVERFLOW_BIT = 6
const NEGATIVE_BIT = 7

const CARRY_FLAG = 1 << CARRY_BIT
const ZERO_FLAG = 1 << ZERO_BIT
const IRQBLK_FLAG = 1 << IRQBLK_BIT
const DECIMAL_FLAG = 1 << DECIMAL_BIT
const BREAK_FLAG = 1 << BREAK_BIT
const RESERVED_FLAG = 1 << RESERVED_BIT
const OVERFLOW_FLAG = 1 << OVERFLOW_BIT
const NEGATIVE_FLAG = 1 << NEGATIVE_BIT

export class Cpu6502 {
  a: number  // A register
  x: number  // X register
  y: number  // Y register
  s: number  // Stack pointer
  p: number  // Status register [NVRBDIZC], negative, overflow, reserved, breakmode, decimal mode, irq blocked, zero, carry
  pc: number  // Program counter
  bank: Uint8Array[]

  constructor() {
    this.bank = <Uint8Array[]>new Array(4)
  }

  setRam(index) {
    const zero = new Array(16 * 1024)
    for (let i = 0; i < 16 * 1024; ++i)
      zero[i] = 0
    this.bank[index] = new Uint8Array(zero)
  }

  setRom(index, rom) {
    this.bank[index] = rom
  }

  reset() {
    this.a = 0
    this.x = 0
    this.y = 0
    this.p = RESERVED_FLAG
    this.s = 0
    this.pc = this.read16(0xfffc)
  }

  setZero(value) {
    this.p = setReset(this.p, value, ZERO_FLAG)
  }

  setOverFlow(value) {
    this.p = setReset(this.p, value, OVERFLOW_FLAG)
  }

  setNegative(value) {
    this.p = setReset(this.p, value, NEGATIVE_FLAG)
  }

  step() {
    const op = this.read8(this.pc++)
    switch (op) {
    case 0x10:  // BPL: Branch plus
      {
        const offset = this.readOffset()
        if ((this.p & NEGATIVE_FLAG) == 0)
          this.pc += offset
      }
      break
    case 0x2c:  // BIT: Check A bit
      {
        const adr = this.readAdr()
        const value = this.read8(adr)
        const result = this.a & value
        this.setZero(result == 0)
        this.p = (this.p & ~(OVERFLOW_FLAG | NEGATIVE_FLAG)) | result & (OVERFLOW_FLAG | NEGATIVE_FLAG)
      }
      break
    case 0x78:  // SEI: Disable IRQ
      // TODO: implement
      break
    case 0x85:  // STA: Zeropage
      {
        const adr = this.read8(this.pc++)
        this.write8(adr, this.a)
      }
      break
    case 0x8d:  // STA: StoreA, Absolute
      {
        const adr = this.readAdr()
        this.push16(this.pc - 1)
        this.pc = adr
      }
      break
    case 0x8c:  // STY: StoreY, Absolute
      {
        const adr = this.readAdr()
        this.write8(adr, this.y)
      }
      break
    case 0x8e:  // STX: StoreX, Absolute
      {
        const adr = this.readAdr()
        this.write8(adr, this.x)
      }
      break
    case 0x9a:  // TXS: Transfer from X to S
      this.s = this.x
      break
    case 0x9d:  // STA: StoreA, Absolute, X
      {
        const adr = (this.readAdr() + this.x) & 0xffff
        this.write8(adr, this.a)
      }
      break
    case 0xa0:  // LDY: LoadY, immediate
      this.y = this.read8(this.pc++)
      break
    case 0xa2:  // LDX: LoadX, immediate
      this.x = this.read8(this.pc++)
      break
    case 0xa9:  // LDA: LoadA, Immediate
      this.a = this.read8(this.pc++)
      break
    case 0xad:  // LDA: LoadA, Absolute
      {
        const adr = this.readAdr()
        this.a = this.read8(adr)
      }
      break
    case 0xcd:  // CMP: Compoare A, Absolute
      {
        const adr = this.readAdr()
        this.compoare(this.read8(adr))
      }
      break
    case 0xd0:  // BNE: Branch not equal
      {
        const offset = this.readOffset()
        if ((this.p & ZERO_FLAG) == 0)
          this.pc += offset
      }
      break
    case 0xd8:  // CLD: BCD to normal mode (not implemented on NES)
      break
    case 0xe8:  // INX: Increment X
      this.x = inc8(this.x)
      break
    default:
      console.error(`Unhandled OPCODE, ${hex(this.pc - 1, 4)}: ${hex(op, 2)}`)
      process.exit(1)
      break
    }
  }

  compoare(value) {
    const dif = this.a - value
    this.setZero(dif == 0)
    this.setNegative((dif & 0x80) != 0)
  }

  read8(adr: number): number {
    const bank = adr >> 14
    return this.bank[bank][adr & 0x3fff]
  }

  read16(adr: number): number {
    const lo = this.read8(adr)
    const hi = this.read8(adr + 1)
    return (hi << 8) | lo
  }

  // Read 2byte from pc.
  readAdr(): number {
    const adr = this.read16(this.pc)
    this.pc += 2
    return adr
  }

  // Read offset(+/-) from pc.
  readOffset(): number {
    const value = this.read8(this.pc++)
    return value < 0x80 ? value : 0x100 - value
  }

  write8(adr: number, value: number): void {
    const bank = adr >> 14
    this.bank[bank][adr & 0x3fff] = value
  }

  push16(value: number) {
    let s = this.s
    this.write8(0x0100 + s, value & 0xff)
    s = dec8(s)
    this.write8(0x0100 + s, value >> 8)
    this.s = dec8(s)
  }
}
