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

// const CARRY_BIT = 0
const ZERO_BIT = 1
const IRQBLK_BIT = 2
// const DECIMAL_BIT = 3
const BREAK_BIT = 4
const RESERVED_BIT = 5
const OVERFLOW_BIT = 6
const NEGATIVE_BIT = 7

// const CARRY_FLAG = 1 << CARRY_BIT
const ZERO_FLAG = 1 << ZERO_BIT
const IRQBLK_FLAG = 1 << IRQBLK_BIT
// const DECIMAL_FLAG = 1 << DECIMAL_BIT
const BREAK_FLAG = 1 << BREAK_BIT
const RESERVED_FLAG = 1 << RESERVED_BIT
const OVERFLOW_FLAG = 1 << OVERFLOW_BIT
const NEGATIVE_FLAG = 1 << NEGATIVE_BIT

enum Addressing {
  IMPLIED,
  IMMEDIATE,
  IMMEDIATE16,
  ZEROPAGE,
  ZEROPAGE_X,
  ZEROPAGE_Y,
  ABSOLUTE,
  ABSOLUTE_X,
  ABSOLUTE_Y,
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
  TXA,
  TXS,

  INX,
  INY,
  INC,

  DEX,
  DEY,
  DEC,

  AND,
  BIT,
  CMP,
  CPX,

  JSR,
  RTS,
  RTI,
  BPL,
  BMI,
  BNE,
  BEQ,


  SEI,
  CLD,
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
  private readerFuncTable: Function[]
  private writerFuncTable: Function[]

  constructor() {
    this.readerFuncTable = new Array(0x10000 / BLOCK_SIZE) as Function[]
    this.writerFuncTable = new Array(0x10000 / BLOCK_SIZE) as Function[]
    this.cycleCount = 0

    this.a = this.x = this.y = this.s = 0
  }

  setReadMemory(start, end, func: (adr: number) => number) {
    const startBlock = Math.floor(start / BLOCK_SIZE)
    const endBlock = Math.floor(end / BLOCK_SIZE)
    for (let i = startBlock; i <= endBlock; ++i)
      this.readerFuncTable[i] = func
  }

  setWriteMemory(start, end, func: (adr: number, value: number) => void) {
    const startBlock = Math.floor(start / BLOCK_SIZE)
    const endBlock = Math.floor(end / BLOCK_SIZE)
    for (let i = startBlock; i <= endBlock; ++i)
      this.writerFuncTable[i] = func
  }

  public reset() {
    this.p = IRQBLK_FLAG | BREAK_FLAG | RESERVED_FLAG
    this.s = (this.s - 3) & 0xff
    this.pc = this.read16(0xfffc)
    this.cycleCount = 0
  }

  public setZero(value) {
    this.p = setReset(this.p, value, ZERO_FLAG)
  }

  public setOverFlow(value) {
    this.p = setReset(this.p, value, OVERFLOW_FLAG)
  }

  public setNegative(value) {
    this.p = setReset(this.p, value, NEGATIVE_FLAG)
  }

  public getInst(opcode) {
    return kInstTable[opcode]
  }

  public step() {
    let pc = this.pc
    const op = this.read8(pc++)
    const inst = this.getInst(op)
    if (inst == null) {
      console.error(`Unhandled OPCODE, ${hex(this.pc - 1, 4)}: ${hex(op, 2)}`)
      process.exit(1)
      return
    }

    this.pc += inst.bytes
    kOpTypeTable[inst.opType](this, pc, inst.addressing)
    this.cycleCount += inst.cycle
  }

  public setFlag(value: number) {
    this.setZero(value === 0)
    this.setNegative((value & 0x80) !== 0)
  }

  public read8(adr: number): number {
    const block = Math.floor(adr / BLOCK_SIZE)
    return this.readerFuncTable[block](adr)
  }

  public read16(adr: number): number {
    const lo = this.read8(adr)
    const hi = this.read8(adr + 1)
    return (hi << 8) | lo
  }

  public write8(adr: number, value: number): void {
    const block = Math.floor(adr / BLOCK_SIZE)
    return this.writerFuncTable[block](adr, value)
  }

  public push(value: number) {
    this.write8(0x0100 + this.s, value)
    this.s = dec8(this.s)
  }

  public push16(value: number) {
    let s = this.s
    this.write8(0x0100 + s, value >> 8)
    s = dec8(s)
    this.write8(0x0100 + s, value & 0xff)
    this.s = dec8(s)
  }

  public pop(value: number) {
    this.s = inc8(this.s)
    return this.read8(0x0100 + this.s)
  }

  public pop16(value: number) {
    let s = this.s
    s = inc8(s)
    const l = this.read8(0x0100 + s)
    s = inc8(s)
    const h = this.read8(0x0100 + s)
    this.s = s
    return (h << 8) | l
  }

  // Non-maskable interrupt
  public nmi() {
    this.push16(this.pc)
    this.push(this.p)
    this.pc = this.read16(0xfffa)
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
  setOp('TXA', 0x8a, OpType.TXA, Addressing.IMPLIED, 1, 2)
  setOp('TXS', 0x9a, OpType.TXS, Addressing.IMPLIED, 1, 2)

  // AND
  setOp('AND', 0x29, OpType.AND, Addressing.IMMEDIATE, 2, 2)
  // BIT
  setOp('BIT', 0x2c, OpType.BIT, Addressing.ABSOLUTE, 3, 4)
  // CMP
  setOp('CMP', 0xcd, OpType.CMP, Addressing.ABSOLUTE, 3, 4)
  // CPX
  setOp('CPX', 0xe0, OpType.CPX, Addressing.IMMEDIATE, 2, 2)
//  // CPY
//  setOp('CPY', 0xcc, Addressing.ABSOLUTE, 3, 4, (cpu, pc, addressing) => {  // CPY: Compoare Y, Absolute
//    const adr = cpu.read16(pc)
//    const value = cpu.read8(adr)
//    cpu.setFlag(cpu.y - value)
//  })
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

  // JSR
  setOp('JSR', 0x20, OpType.JSR, Addressing.ABSOLUTE, 3, 6)
  // RTS
  setOp('RTS', 0x60, OpType.RTS, Addressing.IMPLIED, 1, 6)
  // RTI
  setOp('RTI', 0x40, OpType.RTI, Addressing.IMPLIED, 1, 6)
  // Branch
  setOp('BPL', 0x10, OpType.BPL, Addressing.RELATIVE, 2, 2)
  setOp('BMI', 0x30, OpType.BMI, Addressing.RELATIVE, 2, 2)
  setOp('BNE', 0xd0, OpType.BNE, Addressing.RELATIVE, 2, 2)
  setOp('BEQ', 0xf0, OpType.BEQ, Addressing.RELATIVE, 2, 2)

  setOp('SEI', 0x78, OpType.SEI, Addressing.IMPLIED, 1, 2)
  setOp('CLD', 0xd8, OpType.CLD, Addressing.IMPLIED, 1, 2)

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
    case Addressing.IMMEDIATE:
      adr = pc
      break
    case Addressing.ZEROPAGE:
      adr = cpu.read8(pc)
      break
    case Addressing.ABSOLUTE:
      adr = cpu.read16(pc)
      break
    case Addressing.ABSOLUTE_X:
      adr = (cpu.read16(pc) + cpu.x) & 0xffff
      break
    case Addressing.INDIRECT_Y:
      {
        const zeroPageAdr = cpu.read8(pc)
        adr = (cpu.read16(zeroPageAdr) + cpu.y) & 0xffff
      }
      break
    default:
      console.error(`Illegal load: ${addressing}`)
      return process.exit(1)
    }
    return cpu.read8(adr)
  }

  function store(cpu: Cpu6502, pc: number, addressing: Addressing, value: number) {
    let adr
    switch (addressing) {
    case Addressing.ZEROPAGE:
      adr = cpu.read8(pc)
      break
    case Addressing.ZEROPAGE_X:
      adr = (cpu.read8(pc) + cpu.x) & 0x00ff
      break
    case Addressing.ABSOLUTE:
      adr = cpu.read16(pc)
      break
    case Addressing.ABSOLUTE_X:
      adr = (cpu.read16(pc) + cpu.x) & 0xffff
      break
    default:
      console.error(`Illegal store: ${addressing}`)
      return process.exit(1)
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
  })
  set(OpType.TXA, (cpu, _pc, _) => {
    cpu.a = cpu.x
  })
  set(OpType.TXS, (cpu, _pc, _) => {
    cpu.s = cpu.x
  })

  set(OpType.INX, (cpu, _pc, _) => {
    cpu.x = inc8(cpu.x)
    cpu.setFlag(cpu.x)
  })
  set(OpType.INY, (cpu, _pc, _) => {
    cpu.x = inc8(cpu.y)
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
    cpu.x = dec8(cpu.y)
    cpu.setFlag(cpu.y)
  })
  set(OpType.DEC, (cpu, pc, addressing) => {
    const value = dec8(load(cpu, pc, addressing))
    store(cpu, pc, addressing, value)
    cpu.setFlag(value)
  })

  set(OpType.AND, (cpu, pc, addressing) => {  // AND: Immediate
    const value = load(cpu, pc, addressing)
    cpu.a &= value
    cpu.setFlag(cpu.a)
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
    cpu.setFlag(cpu.a - value)
  })
  set(OpType.CPX, (cpu, pc, addressing) => {
    const value = load(cpu, pc, addressing)
    cpu.setFlag(cpu.x - value)
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

  set(OpType.SEI, (cpu, pc, addressing) => {  // SEI: Disable IRQ
    // TODO: implement
  })
  set(OpType.CLD, (cpu, pc, addressing) => {  // CLD: BCD to normal mode
    // not implemented on NES
  })

  return tbl
})()
