// CPU: MOS 6502

import {Addressing, Instruction, OpType, kInstTable} from './inst.ts'
import {Util} from './util.ts'

import {disassemble} from './disasm.ts'

const DEBUG = false

const hex = Util.hex

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

const VEC_NMI = 0xfffa
const VEC_RESET = 0xfffc
const VEC_IRQ = 0xfffe

const BLOCK_SIZE = 0x2000

const MAX_STEP_LOG = 200

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

const disasm = (() => {
  const kIllegalInstruction: Instruction = {
    opType: OpType.UNKNOWN,
    addressing: Addressing.UNKNOWN,
    bytes: 1,
    cycle: 0,
  }
  const mem = new Uint8Array(3)
  const bins = new Array(3) as string[]

  return function disasm(cpu: Cpu6502, pc: number): string {
    const op = cpu.read8Raw(pc)
    const inst = Cpu6502.getInst(op) || kIllegalInstruction
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
  public breakPoints: any
  public watchRead: {}
  public watchWrite: {}
  public paused: boolean
  private readerFuncTable: Function[]
  private writerFuncTable: Function[]
  private readErrorReported: boolean
  private writeErrorReported: boolean

  private stepLogs: string[]

  public static getInst(opcode: number): Instruction {
    return kInstTable[opcode]
  }

  constructor() {
    this.readerFuncTable = new Array(0x10000 / BLOCK_SIZE) as Function[]
    this.writerFuncTable = new Array(0x10000 / BLOCK_SIZE) as Function[]

    this.a = this.x = this.y = this.s = 0
    this.breakPoints = {}
    this.watchRead = {}
    this.watchWrite = {}
    this.paused = false

    this.stepLogs = []
  }

  public resetMemoryMap() {
    this.readerFuncTable.fill(null)
    this.writerFuncTable.fill(null)
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

    if (DEBUG) {
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

    if (DEBUG) {
      this.addStepLog(`IRQ occurred at pc=${Util.hex(this.pc, 4)}`)
    }
    this.push16(this.pc)
    this.push(this.p & ~BREAK_FLAG)
    this.pc = this.read16(VEC_IRQ)
    this.p |= IRQBLK_FLAG
    return true
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
    let pc = this.pc
    if (DEBUG) {
      this.addStepLog(disasm(this, pc))
    }
    const op = this.read8(pc++)
    const inst = Cpu6502.getInst(op)
    if (inst == null) {
      console.error(`Unhandled OPCODE, ${hex(this.pc - 1, 4)}: ${hex(op, 2)}`)
      this.paused = true
      return 0
    }

    this.pc += inst.bytes
    const adr = this.getAdr(pc, inst.addressing)
    kOpTypeTable[inst.opType](this, adr)

    if (this.breakPoints[this.pc]) {
      this.paused = true
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
      this.paused = true
      console.warn(
        `Break because watched point read: adr=${Util.hex(adr, 4)}, value=${Util.hex(value, 2)}`)
    }
    return value
  }

  public read8Raw(adr: number): number {
    const block = (adr / BLOCK_SIZE) | 0
    const reader = this.readerFuncTable[block]
    if (!reader) {
      if (!this.readErrorReported) {
        console.error(`Illegal read at ${hex(adr, 4)}, pc=${hex(this.pc, 4)}`)
        this.readErrorReported = true
      }
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
      if (!this.writeErrorReported) {
        console.error(`Illegal write at ${hex(adr, 4)}, pc=${hex(this.pc, 4)}, ${hex(value, 2)}`)
        this.writeErrorReported = true
      }
      return
    }
    if (this.watchWrite[adr]) {
      this.paused = true
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

  public pop(): number {
    this.s = inc8(this.s)
    return this.read8(0x0100 + this.s)
  }

  public pop16(): number {
    let s = this.s
    s = inc8(s)
    const l = this.read8(0x0100 + s)
    s = inc8(s)
    const h = this.read8(0x0100 + s)
    this.s = s
    return (h << 8) | l
  }

  public dump(start: number, count: number): void {
    const mem = []
    for (let i = 0; i < count; ++i) {
      mem.push(this.read8(i + start))
    }

    for (let i = 0; i < count; i += 16) {
      const line = mem.splice(0, 16).map(x => Util.hex(x, 2)).join(' ')
      console.log(`${Util.hex(start + i, 4)}: ${line}`)
    }
  }

  public addStepLog(line: string): void {
    if (this.stepLogs.length < MAX_STEP_LOG) {
      this.stepLogs.push(line)
    } else {
      for (let i = 1; i < MAX_STEP_LOG; ++i)
        this.stepLogs[i - 1] = this.stepLogs[i]
      this.stepLogs[MAX_STEP_LOG - 1] = line
    }
  }

  private getAdr(pc: number, addressing: Addressing) {
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
}

const kOpTypeTable = (() => {
  const kTable: ((cpu: Cpu6502, adr: number) => void)[] = [
    // UNKNOWN
    null,
    // NOP
    (_cpu, _) => {},
    // LDA
    (cpu, adr) => {
      cpu.a = cpu.read8(adr)
      cpu.setFlag(cpu.a)
    },
    // STA
    (cpu, adr) => {
      cpu.write8(adr, cpu.a)
    },

    // LDX
    (cpu, adr) => {
      cpu.x = cpu.read8(adr)
      cpu.setFlag(cpu.x)
    },
    // STX
    (cpu, adr) => {
      cpu.write8(adr, cpu.x)
    },

    // LDY
    (cpu, adr) => {
      cpu.y = cpu.read8(adr)
      cpu.setFlag(cpu.y)
    },
    // STY
    (cpu, adr) => {
      cpu.write8(adr, cpu.y)
    },

    // TAX
    (cpu, _) => {
      cpu.x = cpu.a
      cpu.setFlag(cpu.x)
    },
    // TAY
    (cpu, _) => {
      cpu.y = cpu.a
      cpu.setFlag(cpu.y)
    },
    // TXA
    (cpu, _) => {
      cpu.a = cpu.x
      cpu.setFlag(cpu.x)
    },
    // TYA
    (cpu, _) => {
      cpu.a = cpu.y
      cpu.setFlag(cpu.a)
    },
    // TXS
    (cpu, _) => {
      cpu.s = cpu.x
    },
    // TSX
    (cpu, _) => {
      cpu.x = cpu.s
      cpu.setFlag(cpu.x)
    },

    // ADC
    (cpu, adr) => {
      const carry = (cpu.p & CARRY_FLAG) !== 0 ? 1 : 0
      const operand = cpu.read8(adr)
      const result = cpu.a + operand + carry
      const overflow = ((cpu.a ^ result) & (operand ^ result) & 0x80) !== 0
      cpu.a = result & 0xff
      cpu.setFlag(cpu.a)
      cpu.setCarry(result >= 0x0100)
      cpu.setOverFlow(overflow)
    },
    // SBC
    (cpu, adr) => {
      // The 6502 overflow flag explained mathematically
      // http://www.righto.com/2012/12/the-6502-overflow-flag-explained.html
      const carry = (cpu.p & CARRY_FLAG) !== 0 ? 1 : 0
      const operand = 255 - cpu.read8(adr)
      const result = cpu.a + operand + carry
      const overflow = ((cpu.a ^ result) & (operand ^ result) & 0x80) !== 0
      cpu.a = result & 0xff
      cpu.setFlag(cpu.a)
      cpu.setCarry(result >= 0x0100)
      cpu.setOverFlow(overflow)
    },

    // INX
    (cpu, _) => {
      cpu.x = inc8(cpu.x)
      cpu.setFlag(cpu.x)
    },
    // INY
    (cpu, _) => {
      cpu.y = inc8(cpu.y)
      cpu.setFlag(cpu.y)
    },
    // INC
    (cpu, adr) => {
      const value = inc8(cpu.read8(adr))
      cpu.write8(adr, value)
      cpu.setFlag(value)
    },

    // DEX
    (cpu, _) => {
      cpu.x = dec8(cpu.x)
      cpu.setFlag(cpu.x)
    },
    // DEY
    (cpu, _) => {
      cpu.y = dec8(cpu.y)
      cpu.setFlag(cpu.y)
    },
    // DEC
    (cpu, adr) => {
      const value = dec8(cpu.read8(adr))
      cpu.write8(adr, value)
      cpu.setFlag(value)
    },

    // AND
    (cpu, adr) => {
      const value = cpu.read8(adr)
      cpu.a &= value
      cpu.setFlag(cpu.a)
    },
    // ORA
    (cpu, adr) => {
      const value = cpu.read8(adr)
      cpu.a |= value
      cpu.setFlag(cpu.a)
    },
    // EOR
    (cpu, adr) => {
      const value = cpu.read8(adr)
      cpu.a ^= value
      cpu.setFlag(cpu.a)
    },
    // ROL
    (cpu, adr) => {
      const value = adr == null ? cpu.a : cpu.read8(adr)
      const oldCarry = (cpu.p & CARRY_FLAG) !== 0 ? 1 : 0
      const newCarry = (value & 0x80) !== 0
      const newValue = ((value << 1) | oldCarry) & 0xff
      if (adr == null)
        cpu.a = newValue
      else
        cpu.write8(adr, newValue)
      cpu.setFlag(newValue)
      cpu.setCarry(newCarry)
    },
    // ROR
    (cpu, adr) => {
      const value = adr == null ? cpu.a : cpu.read8(adr)
      const oldCarry = (cpu.p & CARRY_FLAG) !== 0 ? 0x80 : 0
      const newCarry = (value & 0x01) !== 0
      const newValue = (value >> 1) | oldCarry
      if (adr == null)
        cpu.a = newValue
      else
        cpu.write8(adr, newValue)
      cpu.setFlag(newValue)
      cpu.setCarry(newCarry)
    },
    // ASL
    (cpu, adr) => {
      const value = adr == null ? cpu.a : cpu.read8(adr)
      const newCarry = (value & 0x80) !== 0
      const newValue = (value << 1) & 0xff
      if (adr == null)
        cpu.a = newValue
      else
        cpu.write8(adr, newValue)
      cpu.setFlag(newValue)
      cpu.setCarry(newCarry)
    },
    // LSR
    (cpu, adr) => {
      const value = adr == null ? cpu.a : cpu.read8(adr)
      const newCarry = (value & 0x01) !== 0
      const newValue = (value >> 1) & 0xff
      if (adr == null)
        cpu.a = newValue
      else
        cpu.write8(adr, newValue)
      cpu.setFlag(newValue)
      cpu.setCarry(newCarry)
    },
    // BIT
    (cpu, adr) => {
      const value = cpu.read8(adr)
      const result = cpu.a & value
      cpu.setZero(result === 0)

      const mask = NEGATIVE_FLAG | OVERFLOW_FLAG
      cpu.p = (cpu.p & ~mask) | (value & mask)
    },
    // CMP
    (cpu, adr) => {
      const value = cpu.read8(adr)
      const result = cpu.a - value
      cpu.setFlag(result)
      cpu.setCarry(result >= 0)
    },
    // CPX
    (cpu, adr) => {
      const value = cpu.read8(adr)
      const result = cpu.x - value
      cpu.setFlag(result)
      cpu.setCarry(result >= 0)
    },
    // CPY
    (cpu, adr) => {
      const value = cpu.read8(adr)
      const result = cpu.y - value
      cpu.setFlag(result)
      cpu.setCarry(result >= 0)
    },

    // JMP
    (cpu, adr) => {
      cpu.pc = adr
    },
    // JSR
    (cpu, adr) => {
      cpu.push16(cpu.pc - 1)
      cpu.pc = adr
    },
    // RTS
    (cpu, _) => {
      cpu.pc = cpu.pop16() + 1
    },
    // RTI
    (cpu, _) => {
      cpu.p = cpu.pop() | RESERVED_FLAG
      cpu.pc = cpu.pop16()
    },

    // BCC
    (cpu, adr) => {
      const offset = toSigned(cpu.read8(adr))
      if ((cpu.p & CARRY_FLAG) === 0)
        cpu.pc += offset
    },
    // BCS
    (cpu, adr) => {
      const offset = toSigned(cpu.read8(adr))
      if ((cpu.p & CARRY_FLAG) !== 0)
        cpu.pc += offset
    },
    // BPL
    (cpu, adr) => {
      const offset = toSigned(cpu.read8(adr))
      if ((cpu.p & NEGATIVE_FLAG) === 0)
        cpu.pc += offset
    },
    // BMI
    (cpu, adr) => {
      const offset = toSigned(cpu.read8(adr))
      if ((cpu.p & NEGATIVE_FLAG) !== 0)
        cpu.pc += offset
    },
    // BNE
    (cpu, adr) => {
      const offset = toSigned(cpu.read8(adr))
      if ((cpu.p & ZERO_FLAG) === 0)
        cpu.pc += offset
    },
    // BEQ
    (cpu, adr) => {
      const offset = toSigned(cpu.read8(adr))
      if ((cpu.p & ZERO_FLAG) !== 0)
        cpu.pc += offset
    },
    // BVC
    (cpu, adr) => {
      const offset = toSigned(cpu.read8(adr))
      if ((cpu.p & OVERFLOW_FLAG) === 0)
        cpu.pc += offset
    },
    // BVS
    (cpu, adr) => {
      const offset = toSigned(cpu.read8(adr))
      if ((cpu.p & OVERFLOW_FLAG) !== 0)
        cpu.pc += offset
    },

    // PHA
    (cpu, _) => {
      cpu.push(cpu.a)
    },
    // PHP
    (cpu, _) => {
      cpu.push(cpu.p | BREAK_FLAG)
    },
    // PLA
    (cpu, _) => {
      cpu.a = cpu.pop()
      cpu.setFlag(cpu.a)
    },
    // PLP
    (cpu, _) => {
      cpu.p = cpu.pop() | RESERVED_FLAG
    },

    // CLC
    (cpu, _) => {
      cpu.p &= ~CARRY_FLAG
    },
    // SEC
    (cpu, _) => {
      cpu.p |= CARRY_FLAG
    },

    // SEI
    (cpu, _) => {
      cpu.p |= IRQBLK_FLAG
    },
    // CLI
    (cpu, _) => {
      cpu.p &= ~IRQBLK_FLAG
    },
    // CLV
    (cpu, _) => {
      cpu.p &= ~OVERFLOW_FLAG
    },
    // SED
    (_cpu, _) => {
      // SED: normal to BCD mode
      // not implemented on NES
    },
    // CLD
    (_cpu, _) => {
      // CLD: BCD to normal mode
      // not implemented on NES
    },

    // BRK
    (cpu, _) => {
      if (DEBUG) {
        cpu.addStepLog('BRK occurred')
      }

      cpu.push16(cpu.pc + 1)
      cpu.push(cpu.p | BREAK_FLAG)
      cpu.pc = cpu.read16(VEC_IRQ)
      cpu.p |= IRQBLK_FLAG
    },
  ]
  return kTable
})()
