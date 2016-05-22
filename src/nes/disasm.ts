import {Addressing} from './cpu.ts'
import {Util} from './util.ts'

export function disassemble(opInst: any, mem: Uint8Array, start: number, pc: number): string {
  let operand = ''
  switch (opInst.addressing) {
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
    operand = ` ($${Util.hex(mem[start] | (mem[start + 1] << 8), 4)})`
    break
  case Addressing.INDIRECT_X:
    operand = ` ($${Util.hex(mem[start] | (mem[start + 1] << 8), 4)}, X)`
    break
  case Addressing.INDIRECT_Y:
    operand = ` ($${Util.hex(mem[start] | (mem[start + 1] << 8), 4)}), Y`
    break
  case Addressing.RELATIVE:
    {
      let offset = mem[start]
      if (offset < 0x80)
        operand = ` +${offset}  ; $${Util.hex(pc + opInst.bytes + offset, 4)}`
      else
        operand = ` ${offset - 256}  ; $${Util.hex(pc + opInst.bytes + offset - 256, 4)}`
    }
    break
  default:
    console.error(`Unhandled addressing: ${opInst.addressing}`)
    break
  }
  return `${opInst.mnemonic}${operand}`
}
