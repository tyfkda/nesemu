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

  getInst(opcode) {
    return kInstTable[opcode]
  }

  step() {
    this.write8(0x2002, 0x80)  // 0x2002=PPU status register, bit7=vblank

    const op = this.read8(this.pc++)
    const inst = this.getInst(op)
    if (inst == null) {
      console.error(`Unhandled OPCODE, ${hex(this.pc - 1, 4)}: ${hex(op, 2)}`)
      process.exit(1)
      return
    }
    inst.func(this)
  }

  setFlag(value) {
    this.setZero(value == 0)
    this.setNegative((value & 0x80) != 0)
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
    return value < 0x80 ? value : value - 0x0100
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

const kInstTable = (() => {
  function setOp(mnemonic, opcode, bytes, cycle, func) {
    tbl[opcode] = {
      func,
      mnemonic,
      bytes,
      cycle,
    }
  }

  const tbl = []

  setOp('BPL', 0x10, 2, 2, (cpu) => {
    const offset = cpu.readOffset()
    if ((cpu.p & NEGATIVE_FLAG) == 0)
      cpu.pc += offset
  })
  setOp('BIT', 0x2c, 3, 4, (cpu) => {  // BIT: Check A bit, Absolute
    const adr = cpu.readAdr()
    const value = cpu.read8(adr)
    const result = cpu.a & value
    cpu.setFlag(result)
  })
  setOp('SEI', 0x78, 1, 2, (cpu) => {  // SEI: Disable IRQ
    // TODO: implement
  })
  setOp('STA', 0x85, 2, 3, (cpu) => {  // STA: Zeropage
    const adr = cpu.read8(cpu.pc++)
    cpu.write8(adr, cpu.a)
  })
  setOp('TXA', 0x8a, 1, 2, (cpu) => {  // TXS: Transfer from X to A
    cpu.a = cpu.x
  })
  setOp('STY', 0x8c, 3, 4, (cpu) => {  // STY: StoreY, Absolute
    const adr = cpu.readAdr()
    cpu.write8(adr, cpu.y)
  })
  setOp('STA', 0x8d, 3, 4, (cpu) => {  // STA: StoreA, Absolute
    const adr = cpu.readAdr()
    cpu.write8(adr, cpu.a)
  })
  setOp('STX', 0x8e, 3, 4, (cpu) => {  // STX: StoreX, Absolute
    const adr = cpu.readAdr()
    cpu.write8(adr, cpu.x)
  })
  setOp('STA', 0x95, 2, 4, (cpu) => {  // STA: Zeropage, X
    const adr = (cpu.read8(cpu.pc++) + cpu.x) & 0xff
    cpu.write8(adr, cpu.a)
  })
  setOp('TXS', 0x9a, 1, 2, (cpu) => {  // TXS: Transfer from X to S
    cpu.s = cpu.x
  })
  setOp('STA', 0x9d, 3, 5, (cpu) => {  // STA: StoreA, Absolute, X
    const adr = (cpu.readAdr() + cpu.x) & 0xffff
    cpu.write8(adr, cpu.a)
  })
  setOp('LDY', 0xa0, 2, 2, (cpu) => {  // LDY: LoadY, immediate
    cpu.y = cpu.read8(cpu.pc++)
  })
  setOp('LDX', 0xa2, 2, 2, (cpu) => {  // LDX: LoadX, immediate
    cpu.x = cpu.read8(cpu.pc++)
  })
  setOp('LDA', 0xa9, 2, 2, (cpu) => {  // LDA: LoadA, Immediate
    cpu.a = cpu.read8(cpu.pc++)
  })
  setOp('LDA', 0xad, 3, 4, (cpu) => {  // LDA: LoadA, Absolute
    const adr = cpu.readAdr()
    cpu.a = cpu.read8(adr)
  })
  setOp('CMP', 0xcd, 3, 4, (cpu) => {  // CMP: Compoare A, Absolute
    const adr = cpu.readAdr()
    cpu.setFlag(cpu.a - cpu.read8(adr))
  })
  setOp('BNE', 0xd0, 2, 2, (cpu) => {  // BNE: Branch not equal
    const offset = cpu.readOffset()
    if ((cpu.p & ZERO_FLAG) == 0)
      cpu.pc += offset
  })
  setOp('CLD', 0xd8, 1, 2, (cpu) => {  // CLD: BCD to normal mode
    // not implemented on NES
  })
  setOp('INX', 0xe8, 1, 2, (cpu) => {  // INX: Increment X
    cpu.x = inc8(cpu.x)
    cpu.setFlag(cpu.x)
  })

  return tbl
})()
