// CPU: MOS 6502

import {Addressing, Instruction, OpType, kInstTable} from './inst'
import {IBus} from './ibus'
import {Util} from '../../util/util'
import {Address, Byte, Word} from '../types'

export const enum IrqType {
  APU,
  EXTERNAL,
  FDS,
}

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

type Bit = 0 | 1

function bit(x: Byte, shift: number) {
  return ((x >> shift) & 1) as Bit
}

interface Regs {
  a: Byte
  x: Byte
  y: Byte
  s: Byte
  p: Byte
  pc: Address
}

const BreakType = {
  NMI: 'nmi',
  IRQ: 'irq',
} as const
type BreakType = typeof BreakType[keyof typeof BreakType]

export class Cpu {
  private a: Byte  // A register
  private x: Byte  // X register
  private y: Byte  // Y register
  private s: Byte  // Stack pointer

  // Status register [NVRBDIZC]
  private negative: Bit = 0
  private overflow: Bit = 0
  private reservedFlag: Bit = 0
  private breakmode: Bit = 0
  private decimal: Bit = 0
  private irqBlocked: Bit = 0
  private zero: Bit = 0
  private carry: Bit = 0

  private pc: Address  // Program counter
  private nmiRequest = -1
  private irqRequest = 0
  private stallCycles = 0

  // For debug
  private breakPoints = new Set<Address | BreakType>()
  private watchRead = new Set<Address>()
  private watchWrite = new Set<Address>()
  private paused = false

  constructor(private bus: IBus) {
    this.a = this.x = this.y = this.s = 0
    this.pc = 0

    this.negative = this.overflow = this.decimal = this.zero = this.carry = 0
    this.irqBlocked = this.breakmode = this.reservedFlag = 1
  }

  public reset(): void {
    this.s = (this.s - 3) & 0xff
    this.pc = this.read16(VEC_RESET)
    this.irqBlocked = 1
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
    this.breakPoints.clear()
    this.watchRead.clear()
    this.watchWrite.clear()
  }

  public pause(value: boolean): void {
    this.paused = value
  }

  public isPaused(): boolean {
    return this.paused
  }

  // Non-maskable interrupt
  public requestNmi(): void {
    this.nmiRequest = 2  // TODO: confirm.
  }

  public requestIrq(type: IrqType): void {
    this.irqRequest |= 1 << type
  }

  public clearIrqRequest(type: IrqType): void {
    this.irqRequest &= ~(1 << type)
  }

  public stall(cycles: number): void {
    this.stallCycles += cycles
  }

  public step(): number {
    if (this.nmiRequest >= 0) {
      if (--this.nmiRequest < 0) {
        const vector = this.read16(VEC_NMI)
        this.push16(this.pc)
        this.push(this.getStatusReg() & ~BREAK_FLAG)
        this.pc = vector
        this.irqBlocked = 1

        if (this.breakPoints.has(BreakType.NMI)) {
          this.paused = true
          console.warn(`paused because NMI: ${Util.hex(this.pc, 4)}, ${Util.hex(vector, 4)}`)
          return 0
        }
      }
    }
    if (this.irqRequest !== 0 && this.irqBlocked === 0) {
      this.irqRequest = 0
      this.handleIrq()
      if (this.paused)
        return 0
    }

    if (this.stallCycles > 0) {
      const cycles = this.stallCycles
      this.stallCycles = 0
      return cycles
    }

    const op = this.read8(this.pc++)
    const inst = kInstTable[op]
    if (inst.opType === OpType.UNKNOWN) {
      console.error(`Unknonwn OPCODE, ${Util.hex(this.pc - 1, 4)}: ${Util.hex(op, 2)}`)
      this.paused = true
      return 0
    }

    return this.execInst(inst)
  }

  private execInst(inst: Instruction): number {
    const pc = this.pc
    this.pc += inst.bytes - 1
    let cycle = inst.cycle
    let adr: Address  // = this.getAdr(pc, inst.addressing)

    switch (inst.addressing) {
    case Addressing.IMMEDIATE:
    case Addressing.RELATIVE:
      adr = pc
      break
    case Addressing.ZEROPAGE:
      adr = this.read8(pc)
      break
    case Addressing.ZEROPAGE_X:
      adr = (this.read8(pc) + this.x) & 0xff
      break
    case Addressing.ZEROPAGE_Y:
      adr = (this.read8(pc) + this.y) & 0xff
      break
    case Addressing.ABSOLUTE:
      adr = this.read16(pc)
      break
    case Addressing.ABSOLUTE_X:
      {
        const base = this.read16(pc)
        adr = (base + this.x) & 0xffff
        if (!inst.write)
          cycle += (((adr ^ base) >> 8) & 1)  // 1 if page crossed or 0
      }
      break
    case Addressing.ABSOLUTE_Y:
      {
        const base = this.read16(pc)
        adr = (base + this.y) & 0xffff
        if (!inst.write)
          cycle += (((adr ^ base) >> 8) & 1)  // 1 if page crossed or 0
      }
      break
    case Addressing.INDIRECT_X:
      {
        const zeroPageAdr = this.read8(pc)
        adr = this.read16Indirect((zeroPageAdr + this.x) & 0xff)
      }
      break
    case Addressing.INDIRECT_Y:
      {
        const zeroPageAdr = this.read8(pc)
        const base = this.read16Indirect(zeroPageAdr)
        adr = (base + this.y) & 0xffff
        if (!inst.write)
          cycle += (((adr ^ base) >> 8) & 1)  // 1 if page crossed or 0
      }
      break
    case Addressing.INDIRECT:
      {
        const indirect = this.read16(pc)
        adr = this.read16Indirect(indirect)
      }
      break
    default:
      console.error(`Illegal addressing: ${inst.addressing}, pc=${Util.hex(pc, 4)}`)
      this.paused = true
      // Fallthrough
    case Addressing.ACCUMULATOR:
    case Addressing.IMPLIED:
      adr = 0  // Dummy.
      break
    }

    // ========================================================
    // Dispatch
    switch (inst.opType) {
    default:
    // case OpType.UNKNOWN:  // Unreachable here.
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
      this.x = (this.x + 1) & 0xff
      this.setNZFlag(this.x)
      break
    case OpType.INY:
      this.y = (this.y + 1) & 0xff
      this.setNZFlag(this.y)
      break
    case OpType.INC:
      {
        const value = (this.read8(adr) + 1) & 0xff
        this.write8(adr, value)
        this.setNZFlag(value)
      }
      break

    case OpType.DEX:
      this.x = (this.x - 1) & 0xff
      this.setNZFlag(this.x)
      break
    case OpType.DEY:
      this.y = (this.y - 1) & 0xff
      this.setNZFlag(this.y)
      break
    case OpType.DEC:
      {
        const value = (this.read8(adr) - 1) & 0xff
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

        this.negative = bit(value, NEGATIVE_BIT)
        this.overflow = bit(value, OVERFLOW_BIT)
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

    // Unofficial

    case OpType.LAX:
      this.a = this.x = this.read8(adr)
      this.setNZFlag(this.a)
      break

    case OpType.SAX:
      this.write8(adr, this.a & this.x)
      break

    case OpType.ISB:
      {
        const value = (this.read8(adr) + 1) & 0xff
        this.write8(adr, value)

        const carry = this.carry
        const operand = 255 - value
        const result = this.a + operand + carry
        const overflow = ((this.a ^ result) & (operand ^ result) & 0x80) !== 0
        this.a = result & 0xff
        this.setNZCFlag(this.a, result >= 0x0100)
        this.setOverFlow(overflow)
      }
      break

    case OpType.DCP:
      {
        // DEC
        const value = (this.read8(adr) - 1) & 0xff
        this.write8(adr, value)

        // CMP
        const result = this.a - value
        this.setNZCFlag(result & 255, result >= 0)
      }
      break

    case OpType.RLA:
      {
        // ROL
        const value = this.read8(adr)
        const oldCarry = this.carry
        const newCarry = value >= 0x80
        const newValue = ((value << 1) | oldCarry) & 0xff
        this.write8(adr, newValue)

        // AND
        this.a &= newValue
        this.setNZCFlag(this.a, newCarry)
      }
      break

    case OpType.RRA:
      {
        // ROR
        const value = this.read8(adr)
        const oldCarry = this.carry
        const newCarry = (value & 0x01) !== 0
        const newValue = (value >> 1) | (oldCarry << 7)
        this.write8(adr, newValue)

        // ADC
        const carry = newCarry ? 1 : 0
        const operand = newValue
        const result = this.a + operand + carry
        const overflow = ((this.a ^ result) & (operand ^ result) & 0x80) !== 0
        this.a = result & 0xff
        this.setNZCFlag(this.a, result >= 0x0100)
        this.setOverFlow(overflow)
      }
      break

    case OpType.SLO:
      {
        // ASL
        const value = /*isAcc ? this.a :*/ this.read8(adr)
        const newCarry = value >= 0x80
        const newValue = (value << 1) & 0xff
        this.write8(adr, newValue)

        // ORA
        this.a |= newValue
        this.setNZCFlag(this.a, newCarry)
      }
      break

    case OpType.SRE:
      {
        // LSR
        const value = this.read8(adr)
        const newCarry = (value & 0x01) !== 0
        const newValue = (value >> 1) & 0xff
        this.write8(adr, newValue)

        // EOR
        this.a ^= newValue
        this.setNZCFlag(this.a, newCarry)
      }
      break
    }
    // ========================================================

    if (this.breakPoints.has(this.pc)) {
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
    this.negative = bit(p, NEGATIVE_BIT)
    this.overflow = bit(p, OVERFLOW_BIT)
    this.reservedFlag = bit(p, RESERVED_BIT)
    this.breakmode = bit(p, BREAK_BIT)
    this.decimal = bit(p, DECIMAL_BIT)
    this.irqBlocked = bit(p, IRQBLK_BIT)
    this.zero = bit(p, ZERO_BIT)
    this.carry = bit(p, CARRY_BIT)
  }

  private read8(adr: Address): Byte {
    const value = this.bus.read8(adr)
    if (this.watchRead.has(adr)) {
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
    if (this.watchWrite.has(adr)) {
      this.paused = true
      console.warn(
        `Break because watched point write: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
    }
  }

  private push(value: Word): void {
    this.write8(0x0100 + this.s, value)
    this.s = (this.s - 1) & 0xff
  }

  private push16(value: Word): void {
    let s = this.s
    this.write8(0x0100 + s, value >> 8)
    s = (s - 1) & 0xff
    this.write8(0x0100 + s, value & 0xff)
    this.s = (s - 1) & 0xff
  }

  private pop(): Byte {
    this.s = (this.s + 1) & 0xff
    return this.read8(0x0100 + this.s)
  }

  private pop16(): Word {
    let s = this.s
    s = (s + 1) & 0xff
    const l = this.read8(0x0100 + s)
    s = (s + 1) & 0xff
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

  private branch(adr: Address, cond: boolean): number {
    if (!cond)
      return 0
    const pc = this.pc
    const offset = this.read8(adr)
    const newPc = (pc + (offset < 0x80 ? offset : offset - 0x100)) & 0xffff
    this.pc = newPc
    return 1 + (((pc ^ newPc) >> 8) & 1)
  }

  private handleIrq(): void {
    const vector = this.read16(VEC_IRQ)
    if (this.breakPoints.has(BreakType.IRQ)) {
      this.paused = true
      console.warn(`paused because IRQ: ${Util.hex(this.pc, 4)}, ${Util.hex(vector, 4)}`)
    }

    this.push16(this.pc)
    this.push(this.getStatusReg() & ~BREAK_FLAG)
    this.pc = vector
    this.irqBlocked = 1
  }
}
