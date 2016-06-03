// Instruction definitions

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

export interface Instruction {
  opType: OpType
  addressing: Addressing
  bytes: number
  cycle: number
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

  BRK,
  NOP,
}

export const kInstTable: Instruction[] = (() => {
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

  setOp(OpType.BRK, 0x00, Addressing.IMPLIED, 1, 7)
  setOp(OpType.NOP, 0xea, Addressing.IMPLIED, 1, 2)

  return tbl
})()
