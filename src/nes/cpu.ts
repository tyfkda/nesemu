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
  UNKNOWN,
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

export enum OpType {
  UNKNOWN,

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
  CLI,
  CLV,
  SED,
  CLD,

  NOP,
}

export interface Instruction {
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

  static public getInst(opcode: number): Instruction {
    return kInstTable[opcode]
  }

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
      console.warn(
        `Break because watched point read: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
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
      console.warn(
        `Break because watched point write: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
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
  function setOp(opType: OpType, opcode: number, addressing: Addressing,
                 bytes: number, cycle: number) {
    tbl[opcode] = {
      opType,
      addressing,
      bytes,
      cycle,
    }
  }

  // LDA
  setOp(OpType.LDA, 0xa9, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.LDA, 0xa5, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.LDA, 0xb5, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.LDA, 0xad, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.LDA, 0xbd, Addressing.ABSOLUTE_X, 3, 4)
  setOp(OpType.LDA, 0xb9, Addressing.ABSOLUTE_Y, 3, 4)
  setOp(OpType.LDA, 0xa1, Addressing.INDIRECT_X, 2, 6)
  setOp(OpType.LDA, 0xb1, Addressing.INDIRECT_Y, 2, 5)
  // STA
  setOp(OpType.STA, 0x85, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.STA, 0x95, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.STA, 0x8d, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.STA, 0x9d, Addressing.ABSOLUTE_X, 3, 5)
  setOp(OpType.STA, 0x99, Addressing.ABSOLUTE_Y, 3, 5)
  setOp(OpType.STA, 0x95, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.STA, 0x81, Addressing.INDIRECT_X, 2, 6)
  setOp(OpType.STA, 0x91, Addressing.INDIRECT_Y, 2, 6)
  // LDX
  setOp(OpType.LDX, 0xa2, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.LDX, 0xa6, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.LDX, 0xb6, Addressing.ZEROPAGE_Y, 2, 4)
  setOp(OpType.LDX, 0xae, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.LDX, 0xbe, Addressing.ABSOLUTE_Y, 3, 4)
  // STX
  setOp(OpType.STX, 0x86, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.STX, 0x96, Addressing.ZEROPAGE_Y, 2, 4)
  setOp(OpType.STX, 0x8e, Addressing.ABSOLUTE, 3, 4)
  // LDY
  setOp(OpType.LDY, 0xa0, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.LDY, 0xa4, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.LDY, 0xb4, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.LDY, 0xac, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.LDY, 0xbc, Addressing.ABSOLUTE_X, 3, 4)
  // STY
  setOp(OpType.STY, 0x84, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.STY, 0x94, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.STY, 0x8c, Addressing.ABSOLUTE, 3, 4)
  //// T??
  setOp(OpType.TAX, 0xaa, Addressing.IMPLIED, 1, 2)
  setOp(OpType.TAY, 0xa8, Addressing.IMPLIED, 1, 2)
  setOp(OpType.TXA, 0x8a, Addressing.IMPLIED, 1, 2)
  setOp(OpType.TYA, 0x98, Addressing.IMPLIED, 1, 2)
  setOp(OpType.TXS, 0x9a, Addressing.IMPLIED, 1, 2)
  setOp(OpType.TSX, 0xba, Addressing.IMPLIED, 1, 2)

  // ADC
  setOp(OpType.ADC, 0x69, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.ADC, 0x65, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.ADC, 0x75, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.ADC, 0x6d, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.ADC, 0x7d, Addressing.ABSOLUTE_X, 3, 4)
  setOp(OpType.ADC, 0x79, Addressing.ABSOLUTE_Y, 3, 4)
  setOp(OpType.ADC, 0x61, Addressing.INDIRECT_X, 2, 6)
  setOp(OpType.ADC, 0x71, Addressing.INDIRECT_Y, 2, 5)
  // SBC
  setOp(OpType.SBC, 0xe9, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.SBC, 0xe5, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.SBC, 0xf5, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.SBC, 0xed, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.SBC, 0xfd, Addressing.ABSOLUTE_X, 3, 4)
  setOp(OpType.SBC, 0xf9, Addressing.ABSOLUTE_Y, 3, 4)
  setOp(OpType.SBC, 0xe1, Addressing.INDIRECT_X, 2, 6)
  setOp(OpType.SBC, 0xf1, Addressing.INDIRECT_Y, 2, 5)

  // CMP
  setOp(OpType.CMP, 0xc9, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.CMP, 0xc5, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.CMP, 0xd5, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.CMP, 0xcd, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.CMP, 0xdd, Addressing.ABSOLUTE_X, 3, 4)
  setOp(OpType.CMP, 0xd9, Addressing.ABSOLUTE_Y, 3, 4)
  setOp(OpType.CMP, 0xc1, Addressing.INDIRECT_X, 2, 6)
  setOp(OpType.CMP, 0xd1, Addressing.INDIRECT_Y, 2, 5)
  // CPX
  setOp(OpType.CPX, 0xe0, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.CPX, 0xe4, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.CPX, 0xec, Addressing.ABSOLUTE, 3, 4)
  // CPY
  setOp(OpType.CPY, 0xc0, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.CPY, 0xc4, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.CPY, 0xcc, Addressing.ABSOLUTE, 3, 4)
  // INX
  setOp(OpType.INX, 0xe8, Addressing.IMPLIED, 1, 2)
  // INY
  setOp(OpType.INY, 0xc8, Addressing.IMPLIED, 1, 2)
  // INC
  setOp(OpType.INC, 0xe6, Addressing.ZEROPAGE, 2, 5)
  setOp(OpType.INC, 0xf6, Addressing.ZEROPAGE_X, 2, 6)
  setOp(OpType.INC, 0xee, Addressing.ABSOLUTE, 3, 6)
  setOp(OpType.INC, 0xfe, Addressing.ABSOLUTE_X, 3, 7)

  // DEX
  setOp(OpType.DEX, 0xca, Addressing.IMPLIED, 1, 2)
  // DEY
  setOp(OpType.DEY, 0x88, Addressing.IMPLIED, 1, 2)
  // DEC
  setOp(OpType.DEC, 0xc6, Addressing.ZEROPAGE, 2, 5)
  setOp(OpType.DEC, 0xd6, Addressing.ZEROPAGE_X, 2, 6)
  setOp(OpType.DEC, 0xce, Addressing.ABSOLUTE, 3, 6)
  setOp(OpType.DEC, 0xde, Addressing.ABSOLUTE_X, 3, 7)

  // AND
  setOp(OpType.AND, 0x29, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.AND, 0x25, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.AND, 0x35, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.AND, 0x2d, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.AND, 0x3d, Addressing.ABSOLUTE_X, 3, 4)
  setOp(OpType.AND, 0x39, Addressing.ABSOLUTE_Y, 3, 4)
  setOp(OpType.AND, 0x21, Addressing.INDIRECT_X, 2, 6)
  setOp(OpType.AND, 0x31, Addressing.INDIRECT_Y, 2, 5)
  // ORA
  setOp(OpType.ORA, 0x09, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.ORA, 0x05, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.ORA, 0x15, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.ORA, 0x0d, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.ORA, 0x1d, Addressing.ABSOLUTE_X, 3, 4)
  setOp(OpType.ORA, 0x19, Addressing.ABSOLUTE_Y, 3, 4)
  setOp(OpType.ORA, 0x01, Addressing.INDIRECT_X, 2, 6)
  setOp(OpType.ORA, 0x11, Addressing.INDIRECT_Y, 2, 5)
  // EOR
  setOp(OpType.EOR, 0x49, Addressing.IMMEDIATE, 2, 2)
  setOp(OpType.EOR, 0x45, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.EOR, 0x55, Addressing.ZEROPAGE_X, 2, 4)
  setOp(OpType.EOR, 0x4d, Addressing.ABSOLUTE, 3, 4)
  setOp(OpType.EOR, 0x5d, Addressing.ABSOLUTE_X, 3, 4)
  setOp(OpType.EOR, 0x59, Addressing.ABSOLUTE_Y, 3, 4)
  setOp(OpType.EOR, 0x41, Addressing.INDIRECT_X, 2, 6)
  setOp(OpType.EOR, 0x51, Addressing.INDIRECT_Y, 2, 5)
  // ROL
  setOp(OpType.ROL, 0x2a, Addressing.ACCUMULATOR, 1, 2)
  setOp(OpType.ROL, 0x26, Addressing.ZEROPAGE, 2, 5)
  setOp(OpType.ROL, 0x36, Addressing.ZEROPAGE_X, 2, 6)
  setOp(OpType.ROL, 0x2e, Addressing.ABSOLUTE, 3, 6)
  setOp(OpType.ROL, 0x3e, Addressing.ABSOLUTE_X, 3, 7)
  // ROR
  setOp(OpType.ROR, 0x6a, Addressing.ACCUMULATOR, 1, 2)
  setOp(OpType.ROR, 0x66, Addressing.ZEROPAGE, 2, 5)
  setOp(OpType.ROR, 0x76, Addressing.ZEROPAGE_X, 2, 6)
  setOp(OpType.ROR, 0x6e, Addressing.ABSOLUTE, 3, 6)
  setOp(OpType.ROR, 0x7e, Addressing.ABSOLUTE_X, 3, 7)
  // ASL
  setOp(OpType.ASL, 0x0a, Addressing.ACCUMULATOR, 1, 2)
  setOp(OpType.ASL, 0x06, Addressing.ZEROPAGE, 2, 5)
  setOp(OpType.ASL, 0x16, Addressing.ZEROPAGE_X, 2, 6)
  setOp(OpType.ASL, 0x0e, Addressing.ABSOLUTE, 3, 6)
  setOp(OpType.ASL, 0x1e, Addressing.ABSOLUTE_X, 3, 7)
  // LSR
  setOp(OpType.LSR, 0x4a, Addressing.ACCUMULATOR, 1, 2)
  setOp(OpType.LSR, 0x46, Addressing.ZEROPAGE, 2, 5)
  setOp(OpType.LSR, 0x56, Addressing.ZEROPAGE_X, 2, 6)
  setOp(OpType.LSR, 0x4e, Addressing.ABSOLUTE, 3, 6)
  setOp(OpType.LSR, 0x5e, Addressing.ABSOLUTE_X, 3, 7)
  // BIT
  setOp(OpType.BIT, 0x24, Addressing.ZEROPAGE, 2, 3)
  setOp(OpType.BIT, 0x2c, Addressing.ABSOLUTE, 3, 4)

  // JMP
  setOp(OpType.JMP, 0x4c, Addressing.ABSOLUTE, 3, 3)
  setOp(OpType.JMP, 0x6c, Addressing.INDIRECT, 3, 5)
  // JSR
  setOp(OpType.JSR, 0x20, Addressing.ABSOLUTE, 3, 6)
  // RTS
  setOp(OpType.RTS, 0x60, Addressing.IMPLIED, 1, 6)
  // RTI
  setOp(OpType.RTI, 0x40, Addressing.IMPLIED, 1, 6)
  // Branch
  setOp(OpType.BCC, 0x90, Addressing.RELATIVE, 2, 2)
  setOp(OpType.BCS, 0xb0, Addressing.RELATIVE, 2, 2)
  setOp(OpType.BPL, 0x10, Addressing.RELATIVE, 2, 2)
  setOp(OpType.BMI, 0x30, Addressing.RELATIVE, 2, 2)
  setOp(OpType.BNE, 0xd0, Addressing.RELATIVE, 2, 2)
  setOp(OpType.BEQ, 0xf0, Addressing.RELATIVE, 2, 2)
  setOp(OpType.BVC, 0x50, Addressing.RELATIVE, 2, 2)
  setOp(OpType.BVS, 0x70, Addressing.RELATIVE, 2, 2)

  // Push, Pop
  setOp(OpType.PHA, 0x48, Addressing.IMPLIED, 1, 3)
  setOp(OpType.PHP, 0x08, Addressing.IMPLIED, 1, 3)
  setOp(OpType.PLA, 0x68, Addressing.IMPLIED, 1, 4)
  setOp(OpType.PLP, 0x28, Addressing.IMPLIED, 1, 4)

  setOp(OpType.CLC, 0x18, Addressing.IMPLIED, 1, 2)
  setOp(OpType.SEC, 0x38, Addressing.IMPLIED, 1, 2)

  setOp(OpType.SEI, 0x78, Addressing.IMPLIED, 1, 2)
  setOp(OpType.CLI, 0x58, Addressing.IMPLIED, 1, 2)
  setOp(OpType.CLV, 0xb8, Addressing.IMPLIED, 1, 2)
  setOp(OpType.SED, 0xf8, Addressing.IMPLIED, 1, 2)
  setOp(OpType.CLD, 0xd8, Addressing.IMPLIED, 1, 2)

  setOp(OpType.NOP, 0xea, Addressing.IMPLIED, 1, 2)

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
      adr = (cpu.read8(pc) + cpu.y) & 0xff
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
        adr = cpu.read16Indirect((zeroPageAdr + cpu.x) & 0xff)
      }
      break
    case Addressing.INDIRECT_Y:
      {
        const zeroPageAdr = cpu.read8(pc)
        adr = (cpu.read16Indirect(zeroPageAdr) + cpu.y) & 0xffff
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
      adr = (cpu.read8(pc) + cpu.x) & 0xff
      break
    case Addressing.ZEROPAGE_Y:
      adr = (cpu.read8(pc) + cpu.y) & 0xff
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
        adr = cpu.read16Indirect((zeroPageAdr + cpu.x) & 0xff)
      }
      break
    case Addressing.INDIRECT_Y:
      {
        const zeroPageAdr = cpu.read8(pc)
        adr = (cpu.read16Indirect(zeroPageAdr) + cpu.y) & 0xffff
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
  })
  set(OpType.TSX, (cpu, _pc, _) => {
    cpu.x = cpu.s
    cpu.setFlag(cpu.x)
  })

  set(OpType.ADC, (cpu, pc, addressing) => {
    const carry = (cpu.p & CARRY_FLAG) !== 0 ? 1 : 0
    const operand = load(cpu, pc, addressing)
    const result = cpu.a + operand + carry
    const overflow = ((cpu.a ^ result) & (operand ^ result) & 0x80) !== 0
    cpu.a = result & 0xff
    cpu.setFlag(cpu.a)
    cpu.setCarry(result >= 0x0100)
    cpu.setOverFlow(overflow)
  })
  set(OpType.SBC, (cpu, pc, addressing) => {
    // The 6502 overflow flag explained mathematically
    // http://www.righto.com/2012/12/the-6502-overflow-flag-explained.html
    const carry = (cpu.p & CARRY_FLAG) !== 0 ? 1 : 0
    const operand = 255 - load(cpu, pc, addressing)
    const result = cpu.a + operand + carry
    const overflow = ((cpu.a ^ result) & (operand ^ result) & 0x80) !== 0
    cpu.a = result & 0xff
    cpu.setFlag(cpu.a)
    cpu.setCarry(result >= 0x0100)
    cpu.setOverFlow(overflow)
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
    cpu.setZero(result === 0)

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
  set(OpType.RTI, (cpu, _pc, _) => {
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
    cpu.setFlag(cpu.a)
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

  set(OpType.SEI, (cpu, _pc, _) => {  // SEI: Disable IRQ
    cpu.p |= IRQBLK_BIT
  })
  set(OpType.CLI, (cpu, _pc, _) => {  // CLI: Enable IRQ
    cpu.p &= ~IRQBLK_BIT
  })
  set(OpType.CLV, (cpu, _pc, _) => {
    cpu.p &= ~OVERFLOW_FLAG
  })
  set(OpType.SED, (_cpu, _pc, _) => {  // SED: normal to BCD mode
    // not implemented on NES
  })
  set(OpType.CLD, (_cpu, _pc, _) => {  // CLD: BCD to normal mode
    // not implemented on NES
  })

  set(OpType.NOP, (_cpu, _pc, _addressing) => {})

  return tbl
})()
