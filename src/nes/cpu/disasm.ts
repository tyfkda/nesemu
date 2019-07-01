import {Addressing, Instruction, OpType, kInstTable, kIllegalInstruction} from './inst'
import {Bus} from '../bus'
import Util from '../../util/util'

export const kOpcode: {[key: number]: string} = {
  [OpType.LDA]: 'LDA',
  [OpType.STA]: 'STA',
  [OpType.LDX]: 'LDX',
  [OpType.STX]: 'STX',
  [OpType.LDY]: 'LDY',
  [OpType.STY]: 'STY',

  [OpType.TAX]: 'TAX',
  [OpType.TAY]: 'TAY',
  [OpType.TXA]: 'TXA',
  [OpType.TYA]: 'TYA',
  [OpType.TXS]: 'TXS',
  [OpType.TSX]: 'TSX',

  [OpType.ADC]: 'ADC',
  [OpType.SBC]: 'SBC',

  [OpType.INX]: 'INX',
  [OpType.INY]: 'INY',
  [OpType.INC]: 'INC',

  [OpType.DEX]: 'DEX',
  [OpType.DEY]: 'DEY',
  [OpType.DEC]: 'DEC',

  [OpType.AND]: 'AND',
  [OpType.ORA]: 'ORA',
  [OpType.EOR]: 'EOR',
  [OpType.ROL]: 'ROL',
  [OpType.ROR]: 'ROR',
  [OpType.ASL]: 'ASL',
  [OpType.LSR]: 'LSR',
  [OpType.BIT]: 'BIT',
  [OpType.CMP]: 'CMP',
  [OpType.CPX]: 'CPX',
  [OpType.CPY]: 'CPY',

  [OpType.JMP]: 'JMP',
  [OpType.JSR]: 'JSR',
  [OpType.RTS]: 'RTS',
  [OpType.RTI]: 'RTI',
  [OpType.BCC]: 'BCC',
  [OpType.BCS]: 'BCS',
  [OpType.BPL]: 'BPL',
  [OpType.BMI]: 'BMI',
  [OpType.BNE]: 'BNE',
  [OpType.BEQ]: 'BEQ',
  [OpType.BVC]: 'BVC',
  [OpType.BVS]: 'BVS',

  [OpType.PHA]: 'PHA',
  [OpType.PHP]: 'PHP',
  [OpType.PLA]: 'PLA',
  [OpType.PLP]: 'PLP',

  [OpType.CLC]: 'CLC',
  [OpType.SEC]: 'SEC',

  [OpType.SEI]: 'SEI',
  [OpType.CLI]: 'CLI',
  [OpType.CLV]: 'CLV',
  [OpType.SED]: 'SED',
  [OpType.CLD]: 'CLD',

  [OpType.BRK]: 'BRK',
  [OpType.NOP]: 'NOP',
}

export function disassemble(inst: Instruction, mem: Uint8Array, start: number, pc: number): string
{
  let operand = ''
  switch (inst.addressing) {
  case Addressing.IMPLIED:
  case Addressing.ACCUMULATOR:
    break
  case Addressing.IMMEDIATE:
    operand = ` #$${Util.hex(mem[start], 2)}`
    break
  case Addressing.IMMEDIATE16:
    operand = ` #$${Util.hex(mem[start] | (mem[start + 1] << 8), 4)}`
    break
  case Addressing.ZEROPAGE:
    operand = ` $${Util.hex(mem[start], 2)}`
    break
  case Addressing.ZEROPAGE_X:
    operand = ` $${Util.hex(mem[start], 2)}, X`
    break
  case Addressing.ZEROPAGE_Y:
    operand = ` $${Util.hex(mem[start], 2)}, Y`
    break
  case Addressing.ABSOLUTE:
    operand = ` $${Util.hex(mem[start] | (mem[start + 1] << 8), 4)}`
    break
  case Addressing.ABSOLUTE_X:
    operand = ` $${Util.hex(mem[start] | (mem[start + 1] << 8), 4)}, X`
    break
  case Addressing.ABSOLUTE_Y:
    operand = ` $${Util.hex(mem[start] | (mem[start + 1] << 8), 4)}, Y`
    break
  case Addressing.INDIRECT:
    operand = ` (\$${Util.hex(mem[start] | (mem[start + 1] << 8), 4)})`
    break
  case Addressing.INDIRECT_X:
    operand = ` (\$${Util.hex(mem[start], 2)}, X)`
    break
  case Addressing.INDIRECT_Y:
    operand = ` (\$${Util.hex(mem[start], 2)}), Y`
    break
  case Addressing.RELATIVE:
    {
      const offset = mem[start]
      if (offset < 0x80)
        operand = ` +${offset}  ; $${Util.hex(pc + inst.bytes + offset, 4)}`
      else
        operand = ` ${offset - 256}  ; \$${Util.hex(pc + inst.bytes + offset - 256, 4)}`
    }
    break
  default:
    console.error(`Unhandled addressing: ${inst.addressing}`)
    break
  }
  return `${kOpcode[inst.opType]}${operand}`
}

const tmpmem = new Uint8Array(3)
const bins = new Array<string>(3)
export function disasm(bus: Bus, pc: number): string {
  const op = bus.read8(pc)
  const inst = kInstTable[op] || kIllegalInstruction
  for (let i = 0; i < inst.bytes; ++i) {
    const m = bus.read8(pc + i)
    tmpmem[i] = m
    bins[i] = Util.hex(m, 2)
  }
  for (let i = inst.bytes; i < 3; ++i)
    bins[i] = '  '

  const pcStr = Util.hex(pc, 4)
  const binStr = bins.join(' ')
  const asmStr = disassemble(inst, tmpmem, 1, pc)
  return `${pcStr}: ${binStr}   ${asmStr}`
}
