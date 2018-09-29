// CPU: MOS 6502

import {Addressing, OpType, kInstTable} from './inst'
import {Bus} from './bus'
import Util from '../util/util'
import {Address, Byte, Word} from './types'

import {disasm} from './disasm'

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

function setReset(p: Byte, flag: boolean, mask: Byte): number {
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

interface Regs {
  a: Byte
  x: Byte
  y: Byte
  s: Byte
  p: Byte
  pc: Address
}

export class Cpu {
  private a: Byte  // A register
  private x: Byte  // X register
  private y: Byte  // Y register
  private s: Byte  // Stack pointer
  private p: Byte  // Status register [NVRBDIZC],
                   //   N: negative
                   //   V: overflow
                   //   R: reserved
                   //   B: breakmode
                   //   D: decimal mode
                   //   I: irq blocked
                   //   Z: zero
                   //   C: carry
  private pc: Address  // Program counter
  private breakPoints: any = {}
  private watchRead: any = {}
  private watchWrite: any = {}
  private paused = false
  private irqDetected = false

  private $DEBUG: boolean
  private stepLogs: string[] = []

  constructor(private bus: Bus) {
    this.$DEBUG = !!window.$DEBUG  // Accessing global variable!!!

    this.a = this.x = this.y = this.s = 0
  }

  public reset(): void {
    this.p = IRQBLK_FLAG | BREAK_FLAG | RESERVED_FLAG
    this.s = (this.s - 3) & 0xff
    this.pc = this.read16(VEC_RESET)
    this.stepLogs.length = 0
  }

  public getRegs(): Regs {
    return {
      a: this.a,
      x: this.x,
      y: this.y,
      s: this.s,
      p: this.p,
      pc: this.pc,
    }
  }

  public save(): object {
    return {
      a: this.a,
      x: this.x,
      y: this.y,
      s: this.s,
      p: this.p,
      pc: this.pc,
    }
  }

  public load(saveData: any): void {
    this.a = saveData.a
    this.x = saveData.x
    this.y = saveData.y
    this.s = saveData.s
    this.p = saveData.p
    this.pc = saveData.pc
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

  public requestIrq(): void {
    this.irqDetected = true
  }

  public step(): number {
    if (this.irqDetected && ((this.p & IRQBLK_FLAG) === 0)) {
      this.irqDetected = false
      this.handleIrq()
    }

    let pc = this.pc
    if (this.$DEBUG) {
      this.addStepLog(disasm(this.bus, pc))
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
    case OpType.UNKNOWN:
      break
    case OpType.NOP:
      break
    case OpType.LDA:
      this.a = this.read8(adr)
      this.setNZFlag(this.a)
      break
    case OpType.STA:
      this.write8(adr, this.a)
      break

    case OpType.LDX:
      this.x = this.read8(adr)
      this.setNZFlag(this.x)
      break
    case OpType.STX:
      this.write8(adr, this.x)
      break

    case OpType.LDY:
      this.y = this.read8(adr)
      this.setNZFlag(this.y)
      break
    case OpType.STY:
      this.write8(adr, this.y)
      break

    case OpType.TAX:
      this.x = this.a
      this.setNZFlag(this.x)
      break
    case OpType.TAY:
      this.y = this.a
      this.setNZFlag(this.y)
      break
    case OpType.TXA:
      this.a = this.x
      this.setNZFlag(this.a)
      break
    case OpType.TYA:
      this.a = this.y
      this.setNZFlag(this.a)
      break
    case OpType.TXS:
      this.s = this.x
      break
    case OpType.TSX:
      this.x = this.s
      this.setNZFlag(this.x)
      break

    case OpType.ADC:
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
    case OpType.SBC:
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

    case OpType.INX:
      this.x = inc8(this.x)
      this.setNZFlag(this.x)
      break
    case OpType.INY:
      this.y = inc8(this.y)
      this.setNZFlag(this.y)
      break
    case OpType.INC:
      {
        const value = inc8(this.read8(adr))
        this.write8(adr, value)
        this.setNZFlag(value)
      }
      break

    case OpType.DEX:
      this.x = dec8(this.x)
      this.setNZFlag(this.x)
      break
    case OpType.DEY:
      this.y = dec8(this.y)
      this.setNZFlag(this.y)
      break
    case OpType.DEC:
      {
        const value = dec8(this.read8(adr))
        this.write8(adr, value)
        this.setNZFlag(value)
      }
      break

    case OpType.AND:
      {
        const value = this.read8(adr)
        this.a &= value
        this.setNZFlag(this.a)
      }
      break
    case OpType.ORA:
      {
        const value = this.read8(adr)
        this.a |= value
        this.setNZFlag(this.a)
      }
      break
    case OpType.EOR:
      {
        const value = this.read8(adr)
        this.a ^= value
        this.setNZFlag(this.a)
      }
      break
    case OpType.ROL:
      {
        const isAcc = inst.addressing === Addressing.ACCUMULATOR
        const value = isAcc ? this.a : this.read8(adr)
        const oldCarry = (this.p & CARRY_FLAG) !== 0 ? 1 : 0
        const newCarry = (value & 0x80) !== 0
        const newValue = ((value << 1) | oldCarry) & 0xff
        if (isAcc)
          this.a = newValue
        else
          this.write8(adr, newValue)
        this.setNZCFlag(newValue, newCarry)
      }
      break
    case OpType.ROR:
      {
        const isAcc = inst.addressing === Addressing.ACCUMULATOR
        const value = isAcc ? this.a : this.read8(adr)
        const oldCarry = (this.p & CARRY_FLAG) !== 0 ? 0x80 : 0
        const newCarry = (value & 0x01) !== 0
        const newValue = (value >> 1) | oldCarry
        if (isAcc)
          this.a = newValue
        else
          this.write8(adr, newValue)
        this.setNZCFlag(newValue, newCarry)
      }
      break
    case OpType.ASL:
      {
        const isAcc = inst.addressing === Addressing.ACCUMULATOR
        const value = isAcc ? this.a : this.read8(adr)
        const newCarry = (value & 0x80) !== 0
        const newValue = (value << 1) & 0xff
        if (isAcc)
          this.a = newValue
        else
          this.write8(adr, newValue)
        this.setNZCFlag(newValue, newCarry)
      }
      break
    case OpType.LSR:
      {
        const isAcc = inst.addressing === Addressing.ACCUMULATOR
        const value = isAcc ? this.a : this.read8(adr)
        const newCarry = (value & 0x01) !== 0
        const newValue = (value >> 1) & 0xff
        if (isAcc)
          this.a = newValue
        else
          this.write8(adr, newValue)
        this.setNZCFlag(newValue, newCarry)
      }
      break
    case OpType.BIT:
      {
        const value = this.read8(adr)
        const result = this.a & value
        this.setZero(result === 0)

        const mask = NEGATIVE_FLAG | OVERFLOW_FLAG
        this.p = (this.p & ~mask) | (value & mask)
      }
      break
    case OpType.CMP:
      {
        const value = this.read8(adr)
        const result = this.a - value
        this.setNZCFlag(result & 255, result >= 0)
      }
      break
    case OpType.CPX:
      {
        const value = this.read8(adr)
        const result = this.x - value
        this.setNZCFlag(result & 255, result >= 0)
      }
      break
    case OpType.CPY:
      {
        const value = this.read8(adr)
        const result = this.y - value
        this.setNZCFlag(result & 255, result >= 0)
      }
      break

    case OpType.JMP:
      this.pc = adr
      break
    case OpType.JSR:
      this.push16(this.pc - 1)
      this.pc = adr
      break
    case OpType.RTS:
      this.pc = this.pop16() + 1
      break
    case OpType.RTI:
      this.p = this.pop() | RESERVED_FLAG
      this.pc = this.pop16()
      break

    case OpType.BCC:
      cycle += this.branch(adr, (this.p & CARRY_FLAG) === 0)
      break
    case OpType.BCS:
      cycle += this.branch(adr, (this.p & CARRY_FLAG) !== 0)
      break
    case OpType.BPL:
      cycle += this.branch(adr, (this.p & NEGATIVE_FLAG) === 0)
      break
    case OpType.BMI:
      cycle += this.branch(adr, (this.p & NEGATIVE_FLAG) !== 0)
      break
    case OpType.BNE:
      cycle += this.branch(adr, (this.p & ZERO_FLAG) === 0)
      break
    case OpType.BEQ:
      cycle += this.branch(adr, (this.p & ZERO_FLAG) !== 0)
      break
    case OpType.BVC:
      cycle += this.branch(adr, (this.p & OVERFLOW_FLAG) === 0)
      break
    case OpType.BVS:
      cycle += this.branch(adr, (this.p & OVERFLOW_FLAG) !== 0)
      break

    case OpType.PHA:
      this.push(this.a)
      break
    case OpType.PHP:
      this.push(this.p | BREAK_FLAG)
      break
    case OpType.PLA:
      this.a = this.pop()
      this.setNZFlag(this.a)
      break
    case OpType.PLP:
      this.p = this.pop() | RESERVED_FLAG
      break

    case OpType.CLC:
      this.p &= ~CARRY_FLAG
      break
    case OpType.SEC:
      this.p |= CARRY_FLAG
      break

    case OpType.SEI:
      this.p |= IRQBLK_FLAG
      break
    case OpType.CLI:
      this.p &= ~IRQBLK_FLAG
      break
    case OpType.CLV:
      this.p &= ~OVERFLOW_FLAG
      break
    case OpType.SED:
      // SED: normal to BCD mode
      // not implemented on NES
      this.p |= DECIMAL_FLAG
      break
    case OpType.CLD:
      // CLD: BCD to normal mode
      // not implemented on NES
      this.p &= ~DECIMAL_FLAG
      break

    case OpType.BRK:
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

  private read8(adr: Address): Byte {
    const value = this.bus.read8(adr)
    if (this.watchRead[adr]) {
      this.paused = true
      console.warn(
        `Break because watched point read: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
    }
    return value
  }

  private read16(adr: Address): Word {
    const lo = this.read8(adr)
    const hi = this.read8(adr + 1)
    return (hi << 8) | lo
  }

  private read16Indirect(adr: Address): Word {
    const lo = this.read8(adr)
    const hi = this.read8((adr & 0xff00) + ((adr + 1) & 0xff))
    return (hi << 8) | lo
  }

  private write8(adr: Address, value: Byte): void {
    this.bus.write8(adr, value)
    if (this.watchWrite[adr]) {
      this.paused = true
      console.warn(
        `Break because watched point write: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
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
      return 0  // Dummy.
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
      return 0
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

  private handleIrq() {
    if (this.$DEBUG) {
      this.addStepLog(`IRQ occurred at pc=${Util.hex(this.pc, 4)}`)
    }
    this.push16(this.pc)
    this.push(this.p & ~BREAK_FLAG)
    this.pc = this.read16(VEC_IRQ)
    this.p |= IRQBLK_FLAG
    return true
  }
}
