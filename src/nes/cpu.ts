// CPU: MOS 6502

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

function toSigned(value: number): number {
  return value < 0x80 ? value : value - 0x0100
}

const CARRY_BIT = 0
const ZERO_BIT = 1
const IRQBLK_BIT = 2
// const DECIMAL_BIT = 3
const BREAK_BIT = 4
const RESERVED_BIT = 5
const OVERFLOW_BIT = 6
const NEGATIVE_BIT = 7

const CARRY_FLAG = 1 << CARRY_BIT
const ZERO_FLAG = 1 << ZERO_BIT
const IRQBLK_FLAG = 1 << IRQBLK_BIT
// const DECIMAL_FLAG = 1 << DECIMAL_BIT
const BREAK_FLAG = 1 << BREAK_BIT
const RESERVED_FLAG = 1 << RESERVED_BIT
const OVERFLOW_FLAG = 1 << OVERFLOW_BIT
const NEGATIVE_FLAG = 1 << NEGATIVE_BIT

export enum Addressing {
  IMPLIED,
  ACCUMULATOR,
  IMMEDIATE,
  IMMEDIATE16,
  ZEROPAGE,
  ZEROPAGE_X,
  ZEROPAGE_Y,
  ABSOLUTE,
  ABSOLUTE_X,
  ABSOLUTE_Y,
  INDIRECT,
  INDIRECT_X,
  INDIRECT_Y,
  RELATIVE,
}

enum OpType {
  LDA,
  STA,
  LDX,
  STX,
  LDY,
  STY,

  TAX,
  TAY,
  TXA,
  TYA,
  TXS,
  TSX,

  ADC,
  SBC,

  INX,
  INY,
  INC,

  DEX,
  DEY,
  DEC,

  AND,
  ORA,
  EOR,
  ROL,
  ROR,
  ASL,
  LSR,
  BIT,
  CMP,
  CPX,
  CPY,

  JMP,
  JSR,
  RTS,
  RTI,
  BCC,
  BCS,
  BPL,
  BMI,
  BNE,
  BEQ,
  BVC,
  BVS,

  PHA,
  PHP,
  PLA,
  PLP,

  CLC,
  SEC,

  SEI,
  CLD,

  NOP,
}

interface Instruction {
  mnemonic: string
  opType: OpType
  addressing: Addressing
  bytes: number
  cycle: number
}

const BLOCK_SIZE = 0x2000

export class Cpu6502 {
  public a: number  // A register
  public x: number  // X register
  public y: number  // Y register
  public s: number  // Stack pointer
  public p: number  // Status register [NVRBDIZC],
                    //   N: negative
                    //   V: overflow
                    //   R: reserved
                    //   B: breakmode
                    //   D: decimal mode
                    //   I: irq blocked
                    //   Z: zero
                    //   C: carry
  public pc: number  // Program counter
  public cycleCount: number
  public breakPoints: {}
  public watchRead: {}
  public watchWrite: {}
  public pausing: boolean
  private readerFuncTable: Function[]
  private writerFuncTable: Function[]

  constructor() {
    this.readerFuncTable = new Array(0x10000 / BLOCK_SIZE) as Function[]
    this.writerFuncTable = new Array(0x10000 / BLOCK_SIZE) as Function[]
    this.cycleCount = 0

    this.a = this.x = this.y = this.s = 0
    this.breakPoints = {}
    this.watchRead = {}
    this.watchWrite = {}
    this.pausing = false
  }

  public setReadMemory(start, end, func: (adr: number) => number): void {
    const startBlock = (start / BLOCK_SIZE) | 0
    const endBlock = (end / BLOCK_SIZE) | 0
    for (let i = startBlock; i <= endBlock; ++i)
      this.readerFuncTable[i] = func
  }

  public setWriteMemory(start, end, func: (adr: number, value: number) => void): void {
    const startBlock = (start / BLOCK_SIZE) | 0
    const endBlock = (end / BLOCK_SIZE) | 0
    for (let i = startBlock; i <= endBlock; ++i)
      this.writerFuncTable[i] = func
  }

  public reset(): void {
    this.p = IRQBLK_FLAG | BREAK_FLAG | RESERVED_FLAG
    this.s = (this.s - 3) & 0xff
    this.pc = this.read16(0xfffc)
    this.cycleCount = 0
  }

  public pause(value: boolean): void {
    this.pausing = value
  }

  public isPaused(): boolean {
    return this.pausing
  }

  public setCarry(value: boolean): void {
    this.p = setReset(this.p, value, CARRY_FLAG)
  }

  public setZero(value: boolean): void {
    this.p = setReset(this.p, value, ZERO_FLAG)
  }

  public setOverFlow(value: boolean): void {
    this.p = setReset(this.p, value, OVERFLOW_FLAG)
  }

  public setNegative(value: boolean): void {
    this.p = setReset(this.p, value, NEGATIVE_FLAG)
  }

  static public getInst(opcode: number): Instruction {
    return kInstTable[opcode]
  }

  public step(): number {
    if (this.pausing)
      return

    let pc = this.pc
    const op = this.read8(pc++)
    const inst = Cpu6502.getInst(op)
    if (inst == null) {
      console.error(`Unhandled OPCODE, ${hex(this.pc - 1, 4)}: ${hex(op, 2)}`)
      this.pausing = true
      return
    }

    this.pc += inst.bytes
    kOpTypeTable[inst.opType](this, pc, inst.addressing)
    this.cycleCount += inst.cycle

    if (this.breakPoints[this.pc]) {
      this.pausing = true
      console.warn(`paused because PC matched break point: ${Util.hex(this.pc, 4)}`)
    }

    return inst.cycle
  }

  public setFlag(value: number) {
    this.setZero(value === 0)
    this.setNegative((value & 0x80) !== 0)
  }

  public read8(adr: number): number {
    const value = this.read8Raw(adr)
    if (this.watchRead[adr]) {
      this.pausing = true
      console.warn(`Break because watched point read: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
    }
    return value
  }

  public read8Raw(adr: number): number {
    const block = (adr / BLOCK_SIZE) | 0
    const reader = this.readerFuncTable[block]
    if (!reader) {
      console.error(`Illegal read at ${hex(adr, 4)}, pc=${hex(this.pc, 4)}`)
      this.pausing = true
      return 0
    }
    return reader(adr)
  }

  public read16(adr: number): number {
    const lo = this.read8(adr)
    const hi = this.read8(adr + 1)
    return (hi << 8) | lo
  }

  public read16Indirect(adr: number): number {
    const lo = this.read8(adr)
    const hi = this.read8((adr & 0xff00) + ((adr + 1) & 0xff))
    return (hi << 8) | lo
  }

  public write8(adr: number, value: number): void {
    const block = (adr / BLOCK_SIZE) | 0
    const writer = this.writerFuncTable[block]
    if (!writer) {
      console.error(`Illegal write at ${hex(adr, 4)}, pc=${hex(this.pc, 4)}`)
      this.pausing = true
      return
    }
    if (this.watchWrite[adr]) {
      this.pausing = true
      console.warn(`Break because watched point write: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
    }
    return this.writerFuncTable[block](adr, value)
  }

  public push(value: number): void {
    this.write8(0x0100 + this.s, value)
    this.s = dec8(this.s)
  }

  public push16(value: number): void {
    let s = this.s
    this.write8(0x0100 + s, value >> 8)
    s = dec8(s)
    this.write8(0x0100 + s, value & 0xff)
    this.s = dec8(s)
  }

  public pop(value: number): number {
    this.s = inc8(this.s)
    return this.read8(0x0100 + this.s)
  }

  public pop16(value: number): number {
    let s = this.s
    s = inc8(s)
    const l = this.read8(0x0100 + s)
    s = inc8(s)
    const h = this.read8(0x0100 + s)
    this.s = s
    return (h << 8) | l
  }

  // Non-maskable interrupt
  public nmi(): void {
    const vector = this.read16(0xfffa)
    if (this.breakPoints.nmi) {
      this.pausing = true
      console.warn(`paused because NMI: ${Util.hex(this.pc, 4)}, ${Util.hex(vector, 4)}`)
    }

    this.push16(this.pc)
    this.push(this.p)
    this.pc = vector
    this.p = (this.p | IRQBLK_FLAG) & ~BREAK_FLAG
  }
}

const kInstTable: Instruction[] = (() => {
  const tbl = []
  function setOp(mnemonic: string, opcode: number, opType: OpType, addressing: Addressing,
                 bytes: number, cycle: number) {
    tbl[opcode] = {
      mnemonic,
      opType,
      addressing,
      bytes,
      cycle,
    }
  }

  // LDA
  setOp('LDA', 0xa9, OpType.LDA, Addressing.IMMEDIATE, 2, 2)
  setOp('LDA', 0xa5, OpType.LDA, Addressing.ZEROPAGE, 2, 3)
  setOp('LDA', 0xb5, OpType.LDA, Addressing.ZEROPAGE_X, 2, 4)
  setOp('LDA', 0xad, OpType.LDA, Addressing.ABSOLUTE, 3, 4)
  setOp('LDA', 0xbd, OpType.LDA, Addressing.ABSOLUTE_X, 3, 4)
  setOp('LDA', 0xb9, OpType.LDA, Addressing.ABSOLUTE_Y, 3, 4)
  setOp('LDA', 0xa1, OpType.LDA, Addressing.INDIRECT_X, 2, 6)
  setOp('LDA', 0xb1, OpType.LDA, Addressing.INDIRECT_Y, 2, 5)
  // STA
  setOp('STA', 0x85, OpType.STA, Addressing.ZEROPAGE, 2, 3)
  setOp('STA', 0x95, OpType.STA, Addressing.ZEROPAGE_X, 2, 4)
  setOp('STA', 0x8d, OpType.STA, Addressing.ABSOLUTE, 3, 4)
  setOp('STA', 0x9d, OpType.STA, Addressing.ABSOLUTE_X, 3, 5)
  setOp('STA', 0x99, OpType.STA, Addressing.ABSOLUTE_Y, 3, 5)
  setOp('STA', 0x95, OpType.STA, Addressing.ZEROPAGE_X, 2, 4)
  setOp('STA', 0x81, OpType.STA, Addressing.INDIRECT_X, 2, 6)
  setOp('STA', 0x91, OpType.STA, Addressing.INDIRECT_Y, 2, 6)
  // LDX
  setOp('LDX', 0xa2, OpType. LDX, Addressing.IMMEDIATE, 2, 2)
  setOp('LDX', 0xa6, OpType. LDX, Addressing.ZEROPAGE, 2, 3)
  setOp('LDX', 0xb6, OpType. LDX, Addressing.ZEROPAGE_Y, 2, 4)
  setOp('LDX', 0xae, OpType. LDX, Addressing.ABSOLUTE, 3, 4)
  setOp('LDX', 0xbe, OpType. LDX, Addressing.ABSOLUTE_Y, 3, 4)
  // STX
  setOp('STX', 0x86, OpType.STX, Addressing.ZEROPAGE, 2, 3)
  setOp('STX', 0x96, OpType.STX, Addressing.ZEROPAGE_Y, 2, 4)
  setOp('STX', 0x8e, OpType.STX, Addressing.ABSOLUTE, 3, 4)
  // LDY
  setOp('LDY', 0xa0, OpType.LDY, Addressing.IMMEDIATE, 2, 2)
  setOp('LDY', 0xa4, OpType.LDY, Addressing.ZEROPAGE, 2, 3)
  setOp('LDY', 0xb4, OpType.LDY, Addressing.ZEROPAGE_X, 2, 4)
  setOp('LDY', 0xac, OpType.LDY, Addressing.ABSOLUTE, 3, 4)
  setOp('LDY', 0xbc, OpType.LDY, Addressing.ABSOLUTE_X, 3, 4)
  // STY
  setOp('STY', 0x84, OpType.STY, Addressing.ZEROPAGE, 2, 3)
  setOp('STY', 0x94, OpType.STY, Addressing.ZEROPAGE_X, 2, 4)
  setOp('STY', 0x8c, OpType.STY, Addressing.ABSOLUTE, 3, 4)
  //// T??
  setOp('TAX', 0xaa, OpType.TAX, Addressing.IMPLIED, 1, 2)
  setOp('TAY', 0xa8, OpType.TAY, Addressing.IMPLIED, 1, 2)
  setOp('TXA', 0x8a, OpType.TXA, Addressing.IMPLIED, 1, 2)
  setOp('TYA', 0x98, OpType.TYA, Addressing.IMPLIED, 1, 2)
  setOp('TXS', 0x9a, OpType.TXS, Addressing.IMPLIED, 1, 2)
  setOp('TSX', 0xba, OpType.TSX, Addressing.IMPLIED, 1, 2)

  // ADC
  setOp('ADC', 0x69, OpType.ADC, Addressing.IMMEDIATE, 2, 2)
  setOp('ADC', 0x65, OpType.ADC, Addressing.ZEROPAGE, 2, 3)
  setOp('ADC', 0x75, OpType.ADC, Addressing.ZEROPAGE_X, 2, 4)
  setOp('ADC', 0x6d, OpType.ADC, Addressing.ABSOLUTE, 3, 4)
  setOp('ADC', 0x7d, OpType.ADC, Addressing.ABSOLUTE_X, 3, 4)
  setOp('ADC', 0x79, OpType.ADC, Addressing.ABSOLUTE_Y, 3, 4)
  setOp('ADC', 0x61, OpType.ADC, Addressing.INDIRECT_X, 2, 6)
  setOp('ADC', 0x71, OpType.ADC, Addressing.INDIRECT_Y, 2, 5)
  // SBC
  setOp('SBC', 0xe9, OpType.SBC, Addressing.IMMEDIATE, 2, 2)
  setOp('SBC', 0xe5, OpType.SBC, Addressing.ZEROPAGE, 2, 3)
  setOp('SBC', 0xf5, OpType.SBC, Addressing.ZEROPAGE_X, 2, 4)
  setOp('SBC', 0xed, OpType.SBC, Addressing.ABSOLUTE, 3, 4)
  setOp('SBC', 0xfd, OpType.SBC, Addressing.ABSOLUTE_X, 3, 4)
  setOp('SBC', 0xf9, OpType.SBC, Addressing.ABSOLUTE_Y, 3, 4)
  setOp('SBC', 0xe1, OpType.SBC, Addressing.INDIRECT_X, 2, 6)
  setOp('SBC', 0xf1, OpType.SBC, Addressing.INDIRECT_Y, 2, 5)

  // CMP
  setOp('CMP', 0xc9, OpType.CMP, Addressing.IMMEDIATE, 2, 2)
  setOp('CMP', 0xc5, OpType.CMP, Addressing.ZEROPAGE, 2, 3)
  setOp('CMP', 0xd5, OpType.CMP, Addressing.ZEROPAGE_X, 2, 4)
  setOp('CMP', 0xcd, OpType.CMP, Addressing.ABSOLUTE, 3, 4)
  setOp('CMP', 0xdd, OpType.CMP, Addressing.ABSOLUTE_X, 3, 4)
  setOp('CMP', 0xd9, OpType.CMP, Addressing.ABSOLUTE_Y, 3, 4)
  setOp('CMP', 0xc1, OpType.CMP, Addressing.INDIRECT_X, 2, 6)
  setOp('CMP', 0xd1, OpType.CMP, Addressing.INDIRECT_Y, 2, 5)
  // CPX
  setOp('CPX', 0xe0, OpType.CPX, Addressing.IMMEDIATE, 2, 2)
  setOp('CPX', 0xe4, OpType.CPX, Addressing.ZEROPAGE, 2, 3)
  setOp('CPX', 0xec, OpType.CPX, Addressing.ABSOLUTE, 3, 4)
  // CPY
  setOp('CPY', 0xc0, OpType.CPY, Addressing.IMMEDIATE, 2, 2)
  setOp('CPY', 0xc4, OpType.CPY, Addressing.ZEROPAGE, 2, 3)
  setOp('CPY', 0xcc, OpType.CPY, Addressing.ABSOLUTE, 3, 4)
  // INX
  setOp('INX', 0xe8, OpType.INX, Addressing.IMPLIED, 1, 2)
  // INY
  setOp('INY', 0xc8, OpType.INY, Addressing.IMPLIED, 1, 2)
  // INC
  setOp('INC', 0xe6, OpType.INC, Addressing.ZEROPAGE, 2, 5)
  setOp('INC', 0xf6, OpType.INC, Addressing.ZEROPAGE_X, 2, 6)
  setOp('INC', 0xee, OpType.INC, Addressing.ABSOLUTE, 3, 6)
  setOp('INC', 0xfe, OpType.INC, Addressing.ABSOLUTE_X, 3, 7)

  // DEX
  setOp('DEX', 0xca, OpType.DEX, Addressing.IMPLIED, 1, 2)
  // DEY
  setOp('DEY', 0x88, OpType.DEY, Addressing.IMPLIED, 1, 2)
  // DEC
  setOp('DEC', 0xc6, OpType.DEC, Addressing.ZEROPAGE, 2, 5)
  setOp('DEC', 0xd6, OpType.DEC, Addressing.ZEROPAGE_X, 2, 6)
  setOp('DEC', 0xce, OpType.DEC, Addressing.ABSOLUTE, 3, 6)
  setOp('DEC', 0xde, OpType.DEC, Addressing.ABSOLUTE_X, 3, 7)

  // AND
  setOp('AND', 0x29, OpType.AND, Addressing.IMMEDIATE, 2, 2)
  setOp('AND', 0x25, OpType.AND, Addressing.ZEROPAGE, 2, 3)
  setOp('AND', 0x35, OpType.AND, Addressing.ZEROPAGE_X, 2, 4)
  setOp('AND', 0x2d, OpType.AND, Addressing.ABSOLUTE, 3, 4)
  setOp('AND', 0x3d, OpType.AND, Addressing.ABSOLUTE_X, 3, 4)
  setOp('AND', 0x39, OpType.AND, Addressing.ABSOLUTE_Y, 3, 4)
  setOp('AND', 0x21, OpType.AND, Addressing.INDIRECT_X, 2, 6)
  setOp('AND', 0x31, OpType.AND, Addressing.INDIRECT_Y, 2, 5)
  // ORA
  setOp('ORA', 0x09, OpType.ORA, Addressing.IMMEDIATE, 2, 2)
  setOp('ORA', 0x05, OpType.ORA, Addressing.ZEROPAGE, 2, 3)
  setOp('ORA', 0x15, OpType.ORA, Addressing.ZEROPAGE_X, 2, 4)
  setOp('ORA', 0x0d, OpType.ORA, Addressing.ABSOLUTE, 3, 4)
  setOp('ORA', 0x1d, OpType.ORA, Addressing.ABSOLUTE_X, 3, 4)
  setOp('ORA', 0x19, OpType.ORA, Addressing.ABSOLUTE_Y, 3, 4)
  setOp('ORA', 0x01, OpType.ORA, Addressing.INDIRECT_X, 2, 6)
  setOp('ORA', 0x11, OpType.ORA, Addressing.INDIRECT_Y, 2, 5)
  // EOR
  setOp('EOR', 0x49, OpType.EOR, Addressing.IMMEDIATE, 2, 2)
  setOp('EOR', 0x45, OpType.EOR, Addressing.ZEROPAGE, 2, 3)
  setOp('EOR', 0x55, OpType.EOR, Addressing.ZEROPAGE_X, 2, 4)
  setOp('EOR', 0x4d, OpType.EOR, Addressing.ABSOLUTE, 3, 4)
  setOp('EOR', 0x5d, OpType.EOR, Addressing.ABSOLUTE_X, 3, 4)
  setOp('EOR', 0x59, OpType.EOR, Addressing.ABSOLUTE_Y, 3, 4)
  setOp('EOR', 0x41, OpType.EOR, Addressing.INDIRECT_X, 2, 6)
  setOp('EOR', 0x51, OpType.EOR, Addressing.INDIRECT_Y, 2, 5)
  // ROL
  setOp('ROL', 0x2a, OpType.ROL, Addressing.ACCUMULATOR, 1, 2)
  setOp('ROL', 0x26, OpType.ROL, Addressing.ZEROPAGE, 2, 5)
  setOp('ROL', 0x36, OpType.ROL, Addressing.ZEROPAGE_X, 2, 6)
  setOp('ROL', 0x2e, OpType.ROL, Addressing.ABSOLUTE, 3, 6)
  setOp('ROL', 0x3e, OpType.ROL, Addressing.ABSOLUTE_X, 3, 7)
  // ROR
  setOp('ROR', 0x6a, OpType.ROR, Addressing.ACCUMULATOR, 1, 2)
  setOp('ROR', 0x66, OpType.ROR, Addressing.ZEROPAGE, 2, 5)
  setOp('ROR', 0x76, OpType.ROR, Addressing.ZEROPAGE_X, 2, 6)
  setOp('ROR', 0x6e, OpType.ROR, Addressing.ABSOLUTE, 3, 6)
  setOp('ROR', 0x7e, OpType.ROR, Addressing.ABSOLUTE_X, 3, 7)
  // ASL
  setOp('ASL', 0x0a, OpType.ASL, Addressing.ACCUMULATOR, 1, 2)
  setOp('ASL', 0x06, OpType.ASL, Addressing.ZEROPAGE, 2, 5)
  setOp('ASL', 0x16, OpType.ASL, Addressing.ZEROPAGE_X, 2, 6)
  setOp('ASL', 0x0e, OpType.ASL, Addressing.ABSOLUTE, 3, 6)
  setOp('ASL', 0x1e, OpType.ASL, Addressing.ABSOLUTE_X, 3, 7)
  // LSR
  setOp('LSR', 0x4a, OpType.LSR, Addressing.ACCUMULATOR, 1, 2)
  setOp('LSR', 0x46, OpType.LSR, Addressing.ZEROPAGE, 2, 5)
  setOp('LSR', 0x56, OpType.LSR, Addressing.ZEROPAGE_X, 2, 6)
  setOp('LSR', 0x4e, OpType.LSR, Addressing.ABSOLUTE, 3, 6)
  setOp('LSR', 0x5e, OpType.LSR, Addressing.ABSOLUTE_X, 3, 7)
  // BIT
  setOp('BIT', 0x24, OpType.BIT, Addressing.ZEROPAGE, 2, 3)
  setOp('BIT', 0x2c, OpType.BIT, Addressing.ABSOLUTE, 3, 4)

  // JMP
  setOp('JMP', 0x4c, OpType.JMP, Addressing.ABSOLUTE, 3, 3)
  setOp('JMP', 0x6c, OpType.JMP, Addressing.INDIRECT, 3, 5)
  // JSR
  setOp('JSR', 0x20, OpType.JSR, Addressing.ABSOLUTE, 3, 6)
  // RTS
  setOp('RTS', 0x60, OpType.RTS, Addressing.IMPLIED, 1, 6)
  // RTI
  setOp('RTI', 0x40, OpType.RTI, Addressing.IMPLIED, 1, 6)
  // Branch
  setOp('BCC', 0x90, OpType.BCC, Addressing.RELATIVE, 2, 2)
  setOp('BCS', 0xb0, OpType.BCS, Addressing.RELATIVE, 2, 2)
  setOp('BPL', 0x10, OpType.BPL, Addressing.RELATIVE, 2, 2)
  setOp('BMI', 0x30, OpType.BMI, Addressing.RELATIVE, 2, 2)
  setOp('BNE', 0xd0, OpType.BNE, Addressing.RELATIVE, 2, 2)
  setOp('BEQ', 0xf0, OpType.BEQ, Addressing.RELATIVE, 2, 2)
  setOp('BVC', 0x50, OpType.BVC, Addressing.RELATIVE, 2, 2)
  setOp('BVS', 0x70, OpType.BVS, Addressing.RELATIVE, 2, 2)

  // Push, Pop
  setOp('PHA', 0x48, OpType.PHA, Addressing.IMPLIED, 1, 3)
  setOp('PHP', 0x08, OpType.PHP, Addressing.IMPLIED, 1, 3)
  setOp('PLA', 0x68, OpType.PLA, Addressing.IMPLIED, 1, 4)
  setOp('PLP', 0x28, OpType.PLP, Addressing.IMPLIED, 1, 4)

  setOp('CLC', 0x18, OpType.CLC, Addressing.IMPLIED, 1, 2)
  setOp('SEC', 0x38, OpType.SEC, Addressing.IMPLIED, 1, 2)

  setOp('SEI', 0x78, OpType.SEI, Addressing.IMPLIED, 1, 2)
  setOp('CLD', 0xd8, OpType.CLD, Addressing.IMPLIED, 1, 2)

  setOp('NOP', 0xea, OpType.NOP, Addressing.IMPLIED, 1, 2)

  return tbl
})()

const kOpTypeTable = (() => {
  const tbl = []

  function set(opType: OpType, func: Function) {
    tbl[opType] = func
  }

  function load(cpu: Cpu6502, pc: number, addressing: Addressing) {
    let adr
    switch (addressing) {
    case Addressing.ACCUMULATOR:
      return cpu.a
    case Addressing.IMMEDIATE:
      adr = pc
      break
    case Addressing.ZEROPAGE:
      adr = cpu.read8(pc)
      break
    case Addressing.ZEROPAGE_X:
      adr = (cpu.read8(pc) + cpu.x) & 0xff
      break
    case Addressing.ZEROPAGE_Y:
      adr = (cpu.read8(pc) + cpu.x) & 0xff
      break
    case Addressing.ABSOLUTE:
      adr = cpu.read16(pc)
      break
    case Addressing.ABSOLUTE_X:
      adr = (cpu.read16(pc) + cpu.x) & 0xffff
      break
    case Addressing.ABSOLUTE_Y:
      adr = (cpu.read16(pc) + cpu.y) & 0xffff
      break
    case Addressing.INDIRECT_X:
      {
        const zeroPageAdr = cpu.read8(pc)
        adr = cpu.read16((zeroPageAdr + cpu.x) & 0xff)
      }
      break
    case Addressing.INDIRECT_Y:
      {
        const zeroPageAdr = cpu.read8(pc)
        adr = (cpu.read16(zeroPageAdr) + cpu.y) & 0xffff
      }
      break
    default:
      console.error(`Illegal addressing: ${addressing}`)
      cpu.pausing = true
      return
    }
    return cpu.read8(adr)
  }

  function store(cpu: Cpu6502, pc: number, addressing: Addressing, value: number) {
    let adr
    switch (addressing) {
    case Addressing.ACCUMULATOR:
      cpu.a = value
      return
    case Addressing.ZEROPAGE:
      adr = cpu.read8(pc)
      break
    case Addressing.ZEROPAGE_X:
      adr = (cpu.read8(pc) + cpu.x) & 0x00ff
      break
    case Addressing.ZEROPAGE_Y:
      adr = (cpu.read8(pc) + cpu.x) & 0xff
      break
    case Addressing.ABSOLUTE:
      adr = cpu.read16(pc)
      break
    case Addressing.ABSOLUTE_X:
      adr = (cpu.read16(pc) + cpu.x) & 0xffff
      break
    case Addressing.ABSOLUTE_Y:
      adr = (cpu.read16(pc) + cpu.y) & 0xffff
      break
    case Addressing.INDIRECT_X:
      {
        const zeroPageAdr = cpu.read8(pc)
        adr = cpu.read16((zeroPageAdr + cpu.x) & 0xff)
      }
      break
    case Addressing.INDIRECT_Y:
      {
        const zeroPageAdr = cpu.read8(pc)
        adr = (cpu.read16(zeroPageAdr) + cpu.y) & 0xffff
      }
      break
    default:
      console.error(`Illegal store: ${addressing}`)
      cpu.pausing = true
      return
    }
    cpu.write8(adr, value)
  }

  set(OpType.LDA, (cpu, pc, addressing) => {
    cpu.a = load(cpu, pc, addressing)
    cpu.setFlag(cpu.a)
  })
  set(OpType.STA, (cpu, pc, addressing) => {
    store(cpu, pc, addressing, cpu.a)
  })

  set(OpType.LDX, (cpu, pc, addressing) => {
    cpu.x = load(cpu, pc, addressing)
    cpu.setFlag(cpu.x)
  })
  set(OpType.STX, (cpu, pc, addressing) => {
    store(cpu, pc, addressing, cpu.x)
  })

  set(OpType.LDY, (cpu, pc, addressing) => {
    cpu.y = load(cpu, pc, addressing)
    cpu.setFlag(cpu.y)
  })
  set(OpType.STY, (cpu, pc, addressing) => {
    store(cpu, pc, addressing, cpu.y)
  })

  set(OpType.TAX, (cpu, _pc, _) => {
    cpu.x = cpu.a
    cpu.setFlag(cpu.x)
  })
  set(OpType.TAY, (cpu, _pc, _) => {
    cpu.y = cpu.a
    cpu.setFlag(cpu.y)
  })
  set(OpType.TXA, (cpu, _pc, _) => {
    cpu.a = cpu.x
    cpu.setFlag(cpu.x)
  })
  set(OpType.TYA, (cpu, _pc, _) => {
    cpu.a = cpu.y
    cpu.setFlag(cpu.a)
  })
  set(OpType.TXS, (cpu, _pc, _) => {
    cpu.s = cpu.x
    cpu.setFlag(cpu.s)
  })
  set(OpType.TSX, (cpu, _pc, _) => {
    cpu.x = cpu.s
    cpu.setFlag(cpu.x)
  })

  set(OpType.ADC, (cpu, pc, addressing) => {
    const operand = load(cpu, pc, addressing)
    const carry = (cpu.p & CARRY_FLAG) !== 0 ? 1 : 0
    const result = cpu.a + operand + carry
    cpu.a = result & 0xff
    cpu.setFlag(cpu.a)
    cpu.setCarry(result >= 0x0100)
  })
  set(OpType.SBC, (cpu, pc, addressing) => {
    const operand = load(cpu, pc, addressing)
    const borrow = (cpu.p & CARRY_FLAG) !== 0 ? 0 : 1
    const result = cpu.a - operand - borrow
    cpu.a = result & 0xff
    cpu.setFlag(cpu.a)
    cpu.setCarry(result >= 0)
  })

  set(OpType.INX, (cpu, _pc, _) => {
    cpu.x = inc8(cpu.x)
    cpu.setFlag(cpu.x)
  })
  set(OpType.INY, (cpu, _pc, _) => {
    cpu.y = inc8(cpu.y)
    cpu.setFlag(cpu.y)
  })
  set(OpType.INC, (cpu, pc, addressing) => {
    const value = inc8(load(cpu, pc, addressing))
    store(cpu, pc, addressing, value)
    cpu.setFlag(value)
  })

  set(OpType.DEX, (cpu, _pc, _) => {
    cpu.x = dec8(cpu.x)
    cpu.setFlag(cpu.x)
  })
  set(OpType.DEY, (cpu, _pc, _) => {
    cpu.y = dec8(cpu.y)
    cpu.setFlag(cpu.y)
  })
  set(OpType.DEC, (cpu, pc, addressing) => {
    const value = dec8(load(cpu, pc, addressing))
    store(cpu, pc, addressing, value)
    cpu.setFlag(value)
  })

  set(OpType.AND, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    cpu.a &= value
    cpu.setFlag(cpu.a)
  })
  set(OpType.ORA, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    cpu.a |= value
    cpu.setFlag(cpu.a)
  })
  set(OpType.EOR, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    cpu.a ^= value
    cpu.setFlag(cpu.a)
  })
  set(OpType.ROL, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    const oldCarry = (cpu.p & CARRY_FLAG) !== 0 ? 1 : 0
    const newCarry = (value & 0x80) !== 0
    const newValue = ((value << 1) | oldCarry) & 0xff
    store(cpu, pc, addressing, newValue)
    cpu.setFlag(newValue)
    cpu.setCarry(newCarry)
  })
  set(OpType.ROR, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    const oldCarry = (cpu.p & CARRY_FLAG) !== 0 ? 0x80 : 0
    const newCarry = (value & 0x01) !== 0
    const newValue = (value >> 1) | oldCarry
    store(cpu, pc, addressing, newValue)
    cpu.setFlag(newValue)
    cpu.setCarry(newCarry)
  })
  set(OpType.ASL, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    const newCarry = (value & 0x80) !== 0
    const newValue = (value << 1) & 0xff
    store(cpu, pc, addressing, newValue)
    cpu.setFlag(newValue)
    cpu.setCarry(newCarry)
  })
  set(OpType.LSR, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    const newCarry = (value & 0x01) !== 0
    const newValue = (value >> 1) & 0xff
    store(cpu, pc, addressing, newValue)
    cpu.setFlag(newValue)
    cpu.setCarry(newCarry)
  })
  set(OpType.BIT, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    const result = cpu.a & value
    cpu.setZero(result)

    const mask = NEGATIVE_FLAG | OVERFLOW_FLAG
    cpu.p = (cpu.p & ~mask) | (value & mask)
  })
  set(OpType.CMP, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    const result = cpu.a - value
    cpu.setFlag(result)
    cpu.setCarry(result >= 0)
  })
  set(OpType.CPX, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    const result = cpu.x - value
    cpu.setFlag(result)
    cpu.setCarry(result >= 0)
  })
  set(OpType.CPY, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    const result = cpu.y - value
    cpu.setFlag(result)
    cpu.setCarry(result >= 0)
  })

  set(OpType.JMP, (cpu, pc, addressing) => {
    let adr = cpu.read16(pc)
    if (addressing !== Addressing.ABSOLUTE)  // Indirect address
      adr = cpu.read16Indirect(adr)
    cpu.pc = adr
  })
  set(OpType.JSR, (cpu, pc, _) => {
    const adr = cpu.read16(pc)
    cpu.push16(pc + 1)
    cpu.pc = adr
  })
  set(OpType.RTS, (cpu, _pc, _) => {
    cpu.pc = cpu.pop16() + 1
  })
  set(OpType.RTI, (cpu, pc, _) => {
    cpu.p = cpu.pop()
    cpu.pc = cpu.pop16()
  })

  set(OpType.BCC, (cpu, pc, _) => {
    const offset = toSigned(cpu.read8(pc))
    if ((cpu.p & CARRY_FLAG) === 0)
      cpu.pc += offset
  })
  set(OpType.BCS, (cpu, pc, _) => {
    const offset = toSigned(cpu.read8(pc))
    if ((cpu.p & CARRY_FLAG) !== 0)
      cpu.pc += offset
  })
  set(OpType.BPL, (cpu, pc, _) => {
    const offset = toSigned(cpu.read8(pc))
    if ((cpu.p & NEGATIVE_FLAG) === 0)
      cpu.pc += offset
  })
  set(OpType.BMI, (cpu, pc, _) => {
    const offset = toSigned(cpu.read8(pc))
    if ((cpu.p & NEGATIVE_FLAG) !== 0)
      cpu.pc += offset
  })
  set(OpType.BNE, (cpu, pc, _) => {
    const offset = toSigned(cpu.read8(pc))
    if ((cpu.p & ZERO_FLAG) === 0)
      cpu.pc += offset
  })
  set(OpType.BEQ, (cpu, pc, _) => {
    const offset = toSigned(cpu.read8(pc))
    if ((cpu.p & ZERO_FLAG) !== 0)
      cpu.pc += offset
  })
  set(OpType.BVC, (cpu, pc, _) => {
    const offset = toSigned(cpu.read8(pc))
    if ((cpu.p & OVERFLOW_FLAG) === 0)
      cpu.pc += offset
  })
  set(OpType.BVS, (cpu, pc, _) => {
    const offset = toSigned(cpu.read8(pc))
    if ((cpu.p & OVERFLOW_FLAG) !== 0)
      cpu.pc += offset
  })

  set(OpType.PHA, (cpu, pc, _) => {
    cpu.push(cpu.a)
  })
  set(OpType.PHP, (cpu, pc, _) => {
    cpu.push(cpu.p)
  })
  set(OpType.PLA, (cpu, pc, _) => {
    cpu.a = cpu.pop()
  })
  set(OpType.PLP, (cpu, pc, _) => {
    cpu.p = cpu.pop()
  })

  set(OpType.CLC, (cpu, _pc, _) => {
    cpu.p &= ~CARRY_FLAG
  })
  set(OpType.SEC, (cpu, _pc, _) => {
    cpu.p |= CARRY_FLAG
  })

  set(OpType.SEI, (cpu, pc, addressing) => {  // SEI: Disable IRQ
    // TODO: implement
  })
  set(OpType.CLD, (cpu, pc, addressing) => {  // CLD: BCD to normal mode
    // not implemented on NES
  })

  set(OpType.NOP, (cpu, pc, addressing) => {})

  return tbl
})()
