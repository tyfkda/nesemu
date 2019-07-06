// CPU: MOS 6502

declare var window: any

import {Addressing, OpType, kInstTable} from './inst'
import {Bus} from '../bus'
import Util from '../../util/util'
import {Address, Byte, Word} from '../types'

import {disasm} from './disasm'

const CARRY_BIT = 0
const ZERO_BIT = 1
const IRQBLK_BIT = 2
const DECIMAL_BIT = 3
const BREAK_BIT = 4
const RESERVED_BIT = 5
const OVERFLOW_BIT = 6
const NEGATIVE_BIT = 7

const BREAK_FLAG: Byte = 1 << BREAK_BIT
const RESERVED_FLAG: Byte = 1 << RESERVED_BIT

const VEC_NMI: Address = 0xfffa
const VEC_RESET: Address = 0xfffc
const VEC_IRQ: Address = 0xfffe

const MAX_STEP_LOG = 200

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

  // Status register [NVRBDIZC], 0|1 as a boolean
  private negative = 0
  private overflow = 0
  private breakmode = 0
  private decimal = 0
  private irqBlocked = 0
  private reservedFlag = 0
  private zero = 0
  private carry = 0

  private pc: Address  // Program counter
  private breakPoints: any = {}
  private watchRead: any = {}
  private watchWrite: any = {}
  private paused = false
  private irqDetected = false

  private $DEBUG: boolean
  private stepLogs: string[] = []

  constructor(private bus: Bus) {
    this.$DEBUG = typeof window !== 'undefined' && !!window.$DEBUG  // Accessing global variable!!!

    this.a = this.x = this.y = this.s = 0
    this.pc = 0
  }

  public reset(): void {
    this.s = (this.s - 3) & 0xff
    this.pc = this.read16(VEC_RESET)

    this.negative = this.overflow = this.decimal = this.zero = this.carry = 0
    this.irqBlocked = this.breakmode = 1

    this.stepLogs.length = 0
  }

  public getRegs(): Regs {
    return {
      a: this.a,
      x: this.x,
      y: this.y,
      s: this.s,
      p: this.getStatusReg(),
      pc: this.pc,
    }
  }

  public save(): object {
    return this.getRegs()
  }

  public load(saveData: any): void {
    this.a = saveData.a
    this.x = saveData.x
    this.y = saveData.y
    this.s = saveData.s
    this.pc = saveData.pc

    this.setStatusReg(saveData.p)
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
    this.push(this.getStatusReg() & ~BREAK_FLAG)
    this.pc = vector
    this.irqBlocked = 1
  }

  public requestIrq(): void {
    this.irqDetected = true
  }

  public step(): number {
    if (this.irqDetected && this.irqBlocked === 0) {
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
        const carry = this.carry
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
        const carry = this.carry
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
        const oldCarry = this.carry
        const newCarry = value >= 0x80
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
        const oldCarry = this.carry
        const newCarry = (value & 0x01) !== 0
        const newValue = (value >> 1) | (oldCarry << 7)
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
        const newCarry = value >= 0x80
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
        this.zero = result === 0 ? 1 : 0

        this.negative = (value >> NEGATIVE_BIT) & 1
        this.overflow = (value >> OVERFLOW_BIT) & 1
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
      this.setStatusReg(this.pop() | RESERVED_FLAG)
      this.pc = this.pop16()
      break

    case OpType.BCC:
      cycle += this.branch(adr, this.carry === 0)
      break
    case OpType.BCS:
      cycle += this.branch(adr, this.carry !== 0)
      break
    case OpType.BPL:
      cycle += this.branch(adr, this.negative === 0)
      break
    case OpType.BMI:
      cycle += this.branch(adr, this.negative !== 0)
      break
    case OpType.BNE:
      cycle += this.branch(adr, this.zero === 0)
      break
    case OpType.BEQ:
      cycle += this.branch(adr, this.zero !== 0)
      break
    case OpType.BVC:
      cycle += this.branch(adr, this.overflow === 0)
      break
    case OpType.BVS:
      cycle += this.branch(adr, this.overflow !== 0)
      break

    case OpType.PHA:
      this.push(this.a)
      break
    case OpType.PHP:
      this.push(this.getStatusReg() | BREAK_FLAG)
      break
    case OpType.PLA:
      this.a = this.pop()
      this.setNZFlag(this.a)
      break
    case OpType.PLP:
      this.setStatusReg(this.pop() | RESERVED_FLAG)
      break

    case OpType.CLC:
      this.carry = 0
      break
    case OpType.SEC:
      this.carry = 1
      break

    case OpType.SEI:
      this.irqBlocked = 1
      break
    case OpType.CLI:
      this.irqBlocked = 0
      break
    case OpType.CLV:
      this.overflow = 0
      break
    case OpType.SED:
      // SED: normal to BCD mode
      // not implemented on NES
      this.decimal = 1
      break
    case OpType.CLD:
      // CLD: BCD to normal mode
      // not implemented on NES
      this.decimal = 0
      break

    case OpType.BRK:
      this.push16(this.pc + 1)
      this.push(this.getStatusReg() | BREAK_FLAG)
      this.pc = this.read16(VEC_IRQ)
      this.irqBlocked = 1
      break
    }
    // ========================================================

    if (this.breakPoints[this.pc]) {
      this.paused = true
      console.warn(`paused because PC matched break point: ${Util.hex(this.pc, 4)}`)
    }

    return cycle
  }

  private getStatusReg(): Byte {
    return ((this.negative << NEGATIVE_BIT) |
            (this.overflow << OVERFLOW_BIT) |
            (this.reservedFlag << RESERVED_BIT) |
            (this.breakmode << BREAK_BIT) |
            (this.decimal << DECIMAL_BIT) |
            (this.irqBlocked << IRQBLK_BIT) |
            (this.zero << ZERO_BIT) |
            (this.carry << CARRY_BIT))
  }

  private setStatusReg(p: Byte): void {
    this.negative = (p >> NEGATIVE_BIT) & 1
    this.overflow = (p >> OVERFLOW_BIT) & 1
    this.reservedFlag = (p >> RESERVED_BIT) & 1
    this.breakmode = (p >> BREAK_BIT) & 1
    this.decimal = (p >> DECIMAL_BIT) & 1
    this.irqBlocked = (p >> IRQBLK_BIT) & 1
    this.zero = (p >> ZERO_BIT) & 1
    this.carry = (p >> CARRY_BIT) & 1
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
    this.zero = nz === 0 ? 1 : 0
    this.negative = nz >= 0x80 ? 1 : 0
  }

  // Set N, Z and C flag for the given value.
  private setNZCFlag(nz: Byte, carry: boolean): void {
    this.zero = nz === 0 ? 1 : 0
    this.negative = nz >= 0x80 ? 1 : 0
    this.carry = carry ? 1 : 0
  }

  private setOverFlow(value: boolean): void {
    this.overflow = value ? 1 : 0
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
    this.push(this.getStatusReg() & ~BREAK_FLAG)
    this.pc = this.read16(VEC_IRQ)
    this.irqBlocked = 1
    return true
  }
}
