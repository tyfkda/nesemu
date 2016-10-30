// CPU: MOS 6502

import {Addressing, Instruction, OpType, kInstTable} from './inst'
import {Util} from './util'
import {Address, Byte, Word} from './types'

import {disassemble} from './disasm'

const CARRY_BIT = 0
const ZERO_BIT = 1
const IRQBLK_BIT = 2
const DECIMAL_BIT = 3
const BREAK_BIT = 4
const RESERVED_BIT = 5
const OVERFLOW_BIT = 6
const NEGATIVE_BIT = 7

const CARRY_FLAG: Byte = 1 << CARRY_BIT
const ZERO_FLAG: Byte = 1 << ZERO_BIT
const IRQBLK_FLAG: Byte = 1 << IRQBLK_BIT
const DECIMAL_FLAG: Byte = 1 << DECIMAL_BIT
const BREAK_FLAG: Byte = 1 << BREAK_BIT
const RESERVED_FLAG: Byte = 1 << RESERVED_BIT
const OVERFLOW_FLAG: Byte = 1 << OVERFLOW_BIT
const NEGATIVE_FLAG: Byte = 1 << NEGATIVE_BIT

const VEC_NMI: Address = 0xfffa
const VEC_RESET: Address = 0xfffc
const VEC_IRQ: Address = 0xfffe

const BLOCK_SIZE = 0x2000

const MAX_STEP_LOG = 200

const _NZ_MASK: Byte = ~(NEGATIVE_FLAG | ZERO_FLAG)
const _NZC_MASK: Byte = ~(NEGATIVE_FLAG | ZERO_FLAG | CARRY_FLAG)

const kNZTable: Uint8Array = (() => {
  const table = new Uint8Array(256)
  for (let i = 0; i < 256; ++i) {
    let value = 0
    if (i === 0)
      value |= ZERO_FLAG
    if ((i & 0x80) !== 0)
      value |= NEGATIVE_FLAG
    table[i] = value
  }
  return table
})()

function setReset(p, flag, mask): number {
  if (flag)
    return p | mask
  return p & ~mask
}

function inc8(value: Byte): Byte {
  return (value + 1) & 0xff
}

function dec8(value: Byte): Byte {
  return (value - 1) & 0xff
}

function toSigned(value: Byte): number {
  return value < 0x80 ? value : value - 0x0100
}

const disasm = (() => {
  const kIllegalInstruction: Instruction = {
    opType: OpType.UNKNOWN,
    addressing: Addressing.UNKNOWN,
    bytes: 1,
    cycle: 0,
  }
  const mem = new Uint8Array(3)
  const bins = new Array(3) as string[]

  return function disasm(cpu: Cpu, pc: number): string {
    const op = cpu.read8Raw(pc)
    const inst = kInstTable[op] || kIllegalInstruction
    for (let i = 0; i < inst.bytes; ++i) {
      const m = cpu.read8Raw(cpu.pc + i)
      mem[i] = m
      bins[i] = Util.hex(m, 2)
    }
    for (let i = inst.bytes; i < 3; ++i)
      bins[i] = '  '

    const pcStr = Util.hex(cpu.pc, 4)
    const binStr = bins.join(' ')
    const asmStr = disassemble(inst, mem, 1, cpu.pc)
    return `${pcStr}: ${binStr}   ${asmStr}`
  }
})()

export class Cpu {
  public a: Byte  // A register
  public x: Byte  // X register
  public y: Byte  // Y register
  public s: Byte  // Stack pointer
  public p: Byte  // Status register [NVRBDIZC],
                  //   N: negative
                  //   V: overflow
                  //   R: reserved
                  //   B: breakmode
                  //   D: decimal mode
                  //   I: irq blocked
                  //   Z: zero
                  //   C: carry
  public pc: Address  // Program counter
  public breakPoints: any = {}
  public watchRead: any = {}
  public watchWrite: any = {}
  public paused = false
  private readerFuncTable = new Array<(adr: Address) => Byte>(0x10000 / BLOCK_SIZE)
  private writerFuncTable = new Array<(adr: Address, value: Byte) => void>(0x10000 / BLOCK_SIZE)
  private readErrorReported: boolean
  private writeErrorReported: boolean

  private $DEBUG: boolean
  private stepLogs: string[] = []

  constructor() {
    this.$DEBUG = !!window.$DEBUG  // Accessing global variable!!!

    this.a = this.x = this.y = this.s = 0
  }

  public resetMemoryMap(): void {
    this.readerFuncTable.fill(null)
    this.writerFuncTable.fill(null)
  }

  public setReadMemory(start: Address, end: Address, func: (adr: Address) => Byte): void {
    const startBlock = (start / BLOCK_SIZE) | 0
    const endBlock = (end / BLOCK_SIZE) | 0
    for (let i = startBlock; i <= endBlock; ++i)
      this.readerFuncTable[i] = func
  }

  public setWriteMemory(start: Address, end: Address,
                        func: (adr: Address, value: Byte) => void): void {
    const startBlock = (start / BLOCK_SIZE) | 0
    const endBlock = (end / BLOCK_SIZE) | 0
    for (let i = startBlock; i <= endBlock; ++i)
      this.writerFuncTable[i] = func
  }

  public reset(): void {
    this.p = IRQBLK_FLAG | BREAK_FLAG | RESERVED_FLAG
    this.s = (this.s - 3) & 0xff
    this.pc = this.read16(VEC_RESET)
    this.readErrorReported = this.writeErrorReported = false
    this.stepLogs.length = 0
  }

  public deleteAllBreakPoints(): void {
    this.breakPoints = {}
    this.watchRead = {}
    this.watchWrite = {}
  }

  public pause(value: boolean): void {
    this.paused = value
  }

  public isPaused(): boolean {
    return this.paused
  }

  // Non-maskable interrupt
  public nmi(): void {
    const vector = this.read16(VEC_NMI)
    if (this.breakPoints.nmi) {
      this.paused = true
      console.warn(`paused because NMI: ${Util.hex(this.pc, 4)}, ${Util.hex(vector, 4)}`)
    }

    if (this.$DEBUG) {
      this.addStepLog(`NMI occurred at pc=${Util.hex(this.pc, 4)}`)
    }
    this.push16(this.pc)
    this.push(this.p & ~BREAK_FLAG)
    this.pc = vector
    this.p |= IRQBLK_FLAG
  }

  public requestIrq(): boolean {
    if ((this.p & IRQBLK_FLAG) !== 0)
      return false

    if (this.$DEBUG) {
      this.addStepLog(`IRQ occurred at pc=${Util.hex(this.pc, 4)}`)
    }
    this.push16(this.pc)
    this.push(this.p & ~BREAK_FLAG)
    this.pc = this.read16(VEC_IRQ)
    this.p |= IRQBLK_FLAG
    return true
  }

  public step(): number {
    let pc = this.pc
    if (this.$DEBUG) {
      this.addStepLog(disasm(this, pc))
    }
    const op = this.read8(pc++)
    const inst = kInstTable[op]
    if (inst == null) {
      console.error(`Unhandled OPCODE, ${Util.hex(this.pc - 1, 4)}: ${Util.hex(op, 2)}`)
      this.paused = true
      return 0
    }

    this.pc += inst.bytes
    const adr = this.getAdr(pc, inst.addressing)
    let cycle = inst.cycle

    // ========================================================
    // Dispatch
    switch (inst.opType) {
    default:
    case 0:  // UNKNOWN
      break
    case 1:  // NOP
      break
    case 2:  // LDA
      this.a = this.read8(adr)
      this.setNZFlag(this.a)
      break
    case 3:  // STA
      this.write8(adr, this.a)
      break

    case 4:  // LDX
      this.x = this.read8(adr)
      this.setNZFlag(this.x)
      break
    case 5:  // STX
      this.write8(adr, this.x)
      break

    case 6:  // LDY
      this.y = this.read8(adr)
      this.setNZFlag(this.y)
      break
    case 7:  // STY
      this.write8(adr, this.y)
      break

    case 8:  // TAX
      this.x = this.a
      this.setNZFlag(this.x)
      break
    case 9:  // TAY
      this.y = this.a
      this.setNZFlag(this.y)
      break
    case 10:  // TXA
      this.a = this.x
      this.setNZFlag(this.x)
      break
    case 11:  // TYA
      this.a = this.y
      this.setNZFlag(this.a)
      break
    case 12:  // TXS
      this.s = this.x
      break
    case 13:  // TSX
      this.x = this.s
      this.setNZFlag(this.x)
      break

    case 14:  // ADC
      {
        const carry = (this.p & CARRY_FLAG) !== 0 ? 1 : 0
        const operand = this.read8(adr)
        const result = this.a + operand + carry
        const overflow = ((this.a ^ result) & (operand ^ result) & 0x80) !== 0
        this.a = result & 0xff
        this.setNZCFlag(this.a, result >= 0x0100)
        this.setOverFlow(overflow)
      }
      break
    case 15:  // SBC
      // The 6502 overflow flag explained mathematically
      // http://www.righto.com/2012/12/the-6502-overflow-flag-explained.html
      {
        const carry = (this.p & CARRY_FLAG) !== 0 ? 1 : 0
        const operand = 255 - this.read8(adr)
        const result = this.a + operand + carry
        const overflow = ((this.a ^ result) & (operand ^ result) & 0x80) !== 0
        this.a = result & 0xff
        this.setNZCFlag(this.a, result >= 0x0100)
        this.setOverFlow(overflow)
      }
      break

    case 16:  // INX
      this.x = inc8(this.x)
      this.setNZFlag(this.x)
      break
    case 17:  // INY
      this.y = inc8(this.y)
      this.setNZFlag(this.y)
      break
    case 18:  // INC
      {
        const value = inc8(this.read8(adr))
        this.write8(adr, value)
        this.setNZFlag(value)
      }
      break

    case 19:  // DEX
      this.x = dec8(this.x)
      this.setNZFlag(this.x)
      break
    case 20:  // DEY
      this.y = dec8(this.y)
      this.setNZFlag(this.y)
      break
    case 21:  // DEC
      {
        const value = dec8(this.read8(adr))
        this.write8(adr, value)
        this.setNZFlag(value)
      }
      break

    case 22:  // AND
      {
        const value = this.read8(adr)
        this.a &= value
        this.setNZFlag(this.a)
      }
      break
    case 23:  // ORA
      {
        const value = this.read8(adr)
        this.a |= value
        this.setNZFlag(this.a)
      }
      break
    case 24:  // EOR
      {
        const value = this.read8(adr)
        this.a ^= value
        this.setNZFlag(this.a)
      }
      break
    case 25:  // ROL
      {
        const value = adr == null ? this.a : this.read8(adr)
        const oldCarry = (this.p & CARRY_FLAG) !== 0 ? 1 : 0
        const newCarry = (value & 0x80) !== 0
        const newValue = ((value << 1) | oldCarry) & 0xff
        if (adr == null)
          this.a = newValue
        else
          this.write8(adr, newValue)
        this.setNZCFlag(newValue, newCarry)
      }
      break
    case 26:  // ROR
      {
        const value = adr == null ? this.a : this.read8(adr)
        const oldCarry = (this.p & CARRY_FLAG) !== 0 ? 0x80 : 0
        const newCarry = (value & 0x01) !== 0
        const newValue = (value >> 1) | oldCarry
        if (adr == null)
          this.a = newValue
        else
          this.write8(adr, newValue)
        this.setNZCFlag(newValue, newCarry)
      }
      break
    case 27:  // ASL
      {
        const value = adr == null ? this.a : this.read8(adr)
        const newCarry = (value & 0x80) !== 0
        const newValue = (value << 1) & 0xff
        if (adr == null)
          this.a = newValue
        else
          this.write8(adr, newValue)
        this.setNZCFlag(newValue, newCarry)
      }
      break
    case 28:  // LSR
      {
        const value = adr == null ? this.a : this.read8(adr)
        const newCarry = (value & 0x01) !== 0
        const newValue = (value >> 1) & 0xff
        if (adr == null)
          this.a = newValue
        else
          this.write8(adr, newValue)
        this.setNZCFlag(newValue, newCarry)
      }
      break
    case 29:  // BIT
      {
        const value = this.read8(adr)
        const result = this.a & value
        this.setZero(result === 0)

        const mask = NEGATIVE_FLAG | OVERFLOW_FLAG
        this.p = (this.p & ~mask) | (value & mask)
      }
      break
    case 30:  // CMP
      {
        const value = this.read8(adr)
        const result = this.a - value
        this.setNZCFlag(result & 255, result >= 0)
      }
      break
    case 31:  // CPX
      {
        const value = this.read8(adr)
        const result = this.x - value
        this.setNZCFlag(result & 255, result >= 0)
      }
      break
    case 32:  // CPY
      {
        const value = this.read8(adr)
        const result = this.y - value
        this.setNZCFlag(result & 255, result >= 0)
      }
      break

    case 33:  // JMP
      this.pc = adr
      break
    case 34:  // JSR
      this.push16(this.pc - 1)
      this.pc = adr
      break
    case 35:  // RTS
      this.pc = this.pop16() + 1
      break
    case 36:  // RTI
      this.p = this.pop() | RESERVED_FLAG
      this.pc = this.pop16()
      break

    case 37:  // BCC
      cycle += this.branch(adr, (this.p & CARRY_FLAG) === 0)
      break
    case 38:  // BCS
      cycle += this.branch(adr, (this.p & CARRY_FLAG) !== 0)
      break
    case 39:  // BPL
      cycle += this.branch(adr, (this.p & NEGATIVE_FLAG) === 0)
      break
    case 40:  // BMI
      cycle += this.branch(adr, (this.p & NEGATIVE_FLAG) !== 0)
      break
    case 41:  // BNE
      cycle += this.branch(adr, (this.p & ZERO_FLAG) === 0)
      break
    case 42:  // BEQ
      cycle += this.branch(adr, (this.p & ZERO_FLAG) !== 0)
      break
    case 43:  // BVC
      cycle += this.branch(adr, (this.p & OVERFLOW_FLAG) === 0)
      break
    case 44:  // BVS
      cycle += this.branch(adr, (this.p & OVERFLOW_FLAG) !== 0)
      break

    case 45:  // PHA
      this.push(this.a)
      break
    case 46:  // PHP
      this.push(this.p | BREAK_FLAG)
      break
    case 47:  // PLA
      this.a = this.pop()
      this.setNZFlag(this.a)
      break
    case 48:  // PLP
      this.p = this.pop() | RESERVED_FLAG
      break

    case 49:  // CLC
      this.p &= ~CARRY_FLAG
      break
    case 50:  // SEC
      this.p |= CARRY_FLAG
      break

    case 51:  // SEI
      this.p |= IRQBLK_FLAG
      break
    case 52:  // CLI
      this.p &= ~IRQBLK_FLAG
      break
    case 53:  // CLV
      this.p &= ~OVERFLOW_FLAG
      break
    case 54:  // SED
      // SED: normal to BCD mode
      // not implemented on NES
      this.p |= DECIMAL_FLAG
      break
    case 55:  // CLD
      // CLD: BCD to normal mode
      // not implemented on NES
      this.p &= ~DECIMAL_FLAG
      break

    case 56:  // BRK
      this.push16(this.pc + 1)
      this.push(this.p | BREAK_FLAG)
      this.pc = this.read16(VEC_IRQ)
      this.p |= IRQBLK_FLAG
      break
    }
    // ========================================================

    if (this.breakPoints[this.pc]) {
      this.paused = true
      console.warn(`paused because PC matched break point: ${Util.hex(this.pc, 4)}`)
    }

    return cycle
  }

  public read8(adr: Address): Byte {
    const value = this.read8Raw(adr)
    if (this.watchRead[adr]) {
      this.paused = true
      console.warn(
        `Break because watched point read: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
    }
    return value
  }

  public read8Raw(adr: Address): Byte {
    const block = (adr / BLOCK_SIZE) | 0
    const reader = this.readerFuncTable[block]
    if (!reader) {
      if (!this.readErrorReported) {
        console.error(`Illegal read at ${Util.hex(adr, 4)}, pc=${Util.hex(this.pc, 4)}`)
        this.readErrorReported = true
      }
      return 0xbf  // Returns dummy value (undefined opcode, non plausible value).
    }
    return reader(adr)
  }

  public read16(adr: Address): Word {
    const lo = this.read8(adr)
    const hi = this.read8(adr + 1)
    return (hi << 8) | lo
  }

  public read16Indirect(adr: Address): Word {
    const lo = this.read8(adr)
    const hi = this.read8((adr & 0xff00) + ((adr + 1) & 0xff))
    return (hi << 8) | lo
  }

  public write8(adr: Address, value: Byte): void {
    const block = (adr / BLOCK_SIZE) | 0
    const writer = this.writerFuncTable[block]
    if (!writer) {
      if (!this.writeErrorReported) {
        const sadr = Util.hex(adr, 4), spc = Util.hex(this.pc, 4), sv = Util.hex(value, 2)
        console.error(`Illegal write at ${sadr}, pc=${spc}, ${sv}`)
        this.writeErrorReported = true
      }
      return
    }
    if (this.watchWrite[adr]) {
      this.paused = true
      console.warn(
        `Break because watched point write: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
    }
    return writer(adr, value)
  }

  public dump(start: Address, count: number): void {
    const mem = []
    for (let i = 0; i < count; ++i) {
      mem.push(this.read8(i + start))
    }

    for (let i = 0; i < count; i += 16) {
      const line = mem.splice(0, 16).map(x => Util.hex(x, 2)).join(' ')
      console.log(`${Util.hex(start + i, 4)}: ${line}`)
    }
  }

  private push(value: Word): void {
    this.write8(0x0100 + this.s, value)
    this.s = dec8(this.s)
  }

  private push16(value: Word): void {
    let s = this.s
    this.write8(0x0100 + s, value >> 8)
    s = dec8(s)
    this.write8(0x0100 + s, value & 0xff)
    this.s = dec8(s)
  }

  private pop(): Byte {
    this.s = inc8(this.s)
    return this.read8(0x0100 + this.s)
  }

  private pop16(): Word {
    let s = this.s
    s = inc8(s)
    const l = this.read8(0x0100 + s)
    s = inc8(s)
    const h = this.read8(0x0100 + s)
    this.s = s
    return (h << 8) | l
  }

  // Set N and Z flag for the given value.
  private setNZFlag(nz: Byte): void {
    this.p = (this.p & _NZ_MASK) | kNZTable[nz]
  }

  // Set N, Z and C flag for the given value.
  private setNZCFlag(nz: Byte, carry: boolean): void {
    this.p = (this.p & _NZC_MASK) | kNZTable[nz] | (carry ? CARRY_FLAG : 0)
  }

  private setZero(value: boolean): void {
    this.p = setReset(this.p, value, ZERO_FLAG)
  }

  private setOverFlow(value: boolean): void {
    this.p = setReset(this.p, value, OVERFLOW_FLAG)
  }

  private addStepLog(line: string): void {
    if (this.stepLogs.length < MAX_STEP_LOG) {
      this.stepLogs.push(line)
    } else {
      for (let i = 1; i < MAX_STEP_LOG; ++i)
        this.stepLogs[i - 1] = this.stepLogs[i]
      this.stepLogs[MAX_STEP_LOG - 1] = line
    }
  }

  private getAdr(pc: Address, addressing: Addressing): Address {
    switch (addressing) {
    case Addressing.ACCUMULATOR:
    case Addressing.IMPLIED:
      return null  // Dummy.
    case Addressing.IMMEDIATE:
    case Addressing.RELATIVE:
      return pc
    case Addressing.ZEROPAGE:
      return this.read8(pc)
    case Addressing.ZEROPAGE_X:
      return (this.read8(pc) + this.x) & 0xff
    case Addressing.ZEROPAGE_Y:
      return (this.read8(pc) + this.y) & 0xff
    case Addressing.ABSOLUTE:
      return this.read16(pc)
    case Addressing.ABSOLUTE_X:
      return (this.read16(pc) + this.x) & 0xffff
    case Addressing.ABSOLUTE_Y:
      return (this.read16(pc) + this.y) & 0xffff
    case Addressing.INDIRECT_X:
      {
        const zeroPageAdr = this.read8(pc)
        return this.read16Indirect((zeroPageAdr + this.x) & 0xff)
      }
    case Addressing.INDIRECT_Y:
      {
        const zeroPageAdr = this.read8(pc)
        const base = this.read16Indirect(zeroPageAdr)
        return (base + this.y) & 0xffff
      }
    case Addressing.INDIRECT:
      {
        const adr = this.read16(pc)
        return this.read16Indirect(adr)
      }
    default:
      console.error(`Illegal addressing: ${addressing}`)
      this.paused = true
      return null
    }
  }

  private branch(adr: Address, cond: boolean): number {
    if (!cond)
      return 0
    const pc = this.pc
    const newPc = (pc + toSigned(this.read8(adr))) & 0xffff
    this.pc = newPc
    return ((pc ^ newPc) & 0x0100) > 0 ? 2 : 1
  }
}
