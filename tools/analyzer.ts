///<reference path="../src/decl/es2017.string.d.ts" />

import * as fs from 'fs'

import {Addressing, Instruction, OpType, kInstTable} from '../src/nes/inst'
import {kOpcode} from '../src/nes/disasm'
import Util from '../src/util/util'

import * as argv from 'argv'

function loadPrgRom(romData: Uint8Array): Uint8Array {
  const start = 16, size = romData[4] * (16 * 1024)
  const prg = romData.slice(start, start + size)
  return new Uint8Array(prg)
}

function insert(array, value, fn) {
  const n = array.length
  let i
  for (i = 0; i < n; ++i) {
    if (fn(array[i], value))
      break
  }
  array.splice(i, 0, value)
}

function isBranch(opType: OpType) {
  switch (opType) {
  case OpType.BCC:
  case OpType.BCS:
  case OpType.BPL:
  case OpType.BMI:
  case OpType.BNE:
  case OpType.BEQ:
  case OpType.BVC:
  case OpType.BCS:
    return true
  default:
    return false
  }
}

class Block {
  public start: number
  public end: number
  public isJumpTable: boolean
}

class Analyzer {
  private memory = new Uint8Array(65536)
  private startAdr = 0
  private endAdr = 0
  private entryPoints = new Array<number>()
  private stopPoints = new Set<number>()
  private labels = new Map<number, any>()
  private blocks = new Array<Block>()
  private labelNameTable: object = {}

  constructor() {
  }

  public loadProgram(buf: Uint8Array, startAdr: number): void {
    for (let i = 0; i < buf.length; ++i)
      this.memory[i + startAdr] = buf[i]
    this.startAdr = startAdr
    this.endAdr = startAdr + buf.length
  }

  public read8(adr: number): number {
    return this.memory[adr]
  }

  public read16(adr: number): number {
    return this.memory[adr] | (this.memory[adr + 1] << 8)
  }

  public addEntryPoint(adr: number): void {
    insert(this.entryPoints, adr, e => adr < e)
  }

  public addStopPoint(adr: number): void {
    this.stopPoints.add(adr)
  }

  public addJumpTable(adr: number, count: number): void {
    const block = this.createBlock(adr)
    block.end = adr + count * 2
    block.isJumpTable = true
    for (let i = 0; i < count; ++i)
      this.addEntryPoint(this.read16(adr + i * 2))
  }

  public setLabelNameTable(labelNameTable: object): void {
    this.labelNameTable = labelNameTable
  }

  private isInBlock(adr: number): boolean {
    for (let block of this.blocks) {
      if (adr >= block.start && adr < block.end)
        return true
    }
    return false
  }

  public analyze(): void {
    while (this.entryPoints.length > 0) {
      const adr = this.entryPoints.pop()
      if (adr == null || this.isInBlock(adr))
        continue
      this.analyzeEntry(adr)
    }

    this.removeOverlappedBlocks()
  }

  public output(): void {
    // Labels
    for (let adr of Array.from(this.labels.keys()).sort((a, b) => a - b)) {
      const label = this.labels.get(adr)
      if (label.isCode)
        continue
      console.log(`${label.label} = $${Util.hex(adr, 4)}`)
    }

    // Blocks
    let prevAdr = this.startAdr
    for (let block of this.blocks) {
      if (prevAdr < block.start) {
        const label = this.labels.get(prevAdr)
        if (label)
          console.log(`${label.label}:`)

        console.log(`\
; Unanalyzed: ${Util.hex(prevAdr, 4)} - ${Util.hex(block.start, 4)} (${block.start - prevAdr} bytes)
`)
      }
      prevAdr = block.end

      if (block.isJumpTable) {
        // TODO
        this.outputJumpTable(block)
        continue
      }

      for (let adr = block.start; adr < block.end; ) {
        const label = this.labels.get(adr)
        if (label)
          console.log(`${label.label}:`)
        this.step(this.memory, adr)

        const op = this.read8(adr)
        const inst = kInstTable[op]
        adr += inst.bytes
      }
      console.log('')
    }
    if (prevAdr < this.endAdr) {
      console.log(`\n; Unanalyzed: ${Util.hex(prevAdr, 4)} - ${Util.hex(this.endAdr, 4)}`)
    }
  }

  private outputJumpTable(block: Block): void {
    const n = (block.end - block.start) / 2 | 0
    for (let i = 0; i < n; ++i) {
      const adr = block.start + i * 2
      const x = this.read16(adr)
      console.log(`\t.dw ${this.getLabelName(x)}`)
    }
    console.log('')
  }

  private analyzeEntry(adr: number): void {
    this.addLabel(adr, true)
    const block = this.createBlock(adr)
    for (;;) {
      const op = this.read8(adr)
      const inst = kInstTable[op]
      if (inst == null) {
        console.error(`Unknown op: ${Util.hex(op, 2)},adr=${Util.hex(adr, 4)}`)
        break
      }
      if (isBranch(inst.opType)) {
        let offset = this.read8(adr + 1)
        if (offset >= 0x80)
          offset -= 256
        const target = adr + inst.bytes + offset
        this.addLabel(target, true)
        this.entryPoints.push(target)
      } else if ((inst.opType === OpType.JMP || inst.opType === OpType.JSR) &&
                 inst.addressing === Addressing.ABSOLUTE) {
        const target = this.read16(adr + 1)
        this.addLabel(target, true)
        this.entryPoints.push(target)
      } else if (inst.addressing === Addressing.ABSOLUTE ||
                 inst.addressing === Addressing.ABSOLUTE_X ||
                 inst.addressing === Addressing.ABSOLUTE_Y) {
        const target = this.read16(adr + 1)
        this.addLabel(target, false)
      }

      if (inst.opType === OpType.JMP ||
          inst.opType === OpType.RTS ||
          inst.opType === OpType.RTI ||
          (inst.opType === OpType.JSR && this.stopPoints.has(this.read16(adr + 1)))) {
        adr += inst.bytes
        break
      }

      adr += inst.bytes
    }
    block.end = adr
  }

  private removeOverlappedBlocks(): void {
    for (let i = 0; i < this.blocks.length; ++i) {
      const block = this.blocks[i]
      for (let j = i; ++j < this.blocks.length; ++j) {
        const block2 = this.blocks[j]
        if (block2.start < block.end && block2.end <= block.end) {
          // Contained, remove.
          this.blocks.splice(j, 1)
          --i
        }
        break
      }
    }
  }

  private step(mem, pc) {
    const op = mem[pc]
    const inst = kInstTable[op]

    const bins = new Array<string>()
    for (let i = 0; i < inst.bytes; ++i) {
      const m = mem[pc + i]
      bins.push(Util.hex(m, 2))
    }

    const asmStr = this.disassemble(inst, mem, pc + 1, pc)
    const binStr = bins.join(' ')
    const pad = ''.padStart((32 - asmStr.length + 7) / 8 | 0, '\t')
    console.log(`\t${asmStr}${pad}; ${Util.hex(pc, 4)}: ${binStr}`)
    return pc + inst.bytes
  }

  private disassemble(inst: Instruction, mem: Uint8Array, start: number, pc: number): string {
    let operand = ''
    switch (inst.addressing) {
    case Addressing.IMPLIED:
    case Addressing.ACCUMULATOR:
      break
    case Addressing.IMMEDIATE:
      operand = ` #$${Util.hex(mem[start], 2)}`
      break
    case Addressing.IMMEDIATE16:
      operand = ` #L${Util.hex(mem[start] | (mem[start + 1] << 8), 4)}`
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
      operand = ` ${this.getLabelName(mem[start] | (mem[start + 1] << 8))}`
      break
    case Addressing.ABSOLUTE_X:
      operand = ` ${this.getLabelName(mem[start] | (mem[start + 1] << 8))}, X`
      break
    case Addressing.ABSOLUTE_Y:
      operand = ` ${this.getLabelName(mem[start] | (mem[start + 1] << 8))}, Y`
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
        const target = pc + inst.bytes + (offset < 0x80 ? offset : offset - 256)
        operand = ` ${this.getLabelName(target)}`
      }
      break
    default:
      console.error(`Unhandled addressing: ${inst.addressing}`)
      break
    }
    return `${kOpcode[inst.opType]}${operand}`
  }

  private createBlock(adr: number): Block {
    const block = new Block()
    block.start = adr
    insert(this.blocks, block, block => adr < block.start)
    return block
  }

  private addLabel(adr, isCode): void {
    let label = this.labels.get(adr)
    if (!label) {
      label = {
        label: this.getLabelName(adr),
        isCode,
      }
      this.labels.set(adr, label)
    } else {
      label.isCode = label.isCode || isCode
    }
  }

  private getLabelName(adr: number): string {
    return this.labelNameTable[adr] || `L${Util.hex(adr, 4)}`
  }
}

function main() {
  argv.option({
    name: 'config',
    short: 'c',
    type: 'path',
  })
  const {targets, options} = argv.run()

  if (targets.length <= 0) {
    console.error('arg: [.nes file]')
    process.exit(1)
  }

  fs.readFile(targets[0], (err, data) => {
    if (err) {
      console.error(err)
      process.exit(1)
    }

    const analyzer = new Analyzer()
    analyzer.loadProgram(loadPrgRom(data), 0x8000)
    analyzer.addEntryPoint(analyzer.read16(0xfffc))  // Reset vector
    analyzer.addEntryPoint(analyzer.read16(0xfffa))  // NMI vector
    analyzer.addJumpTable(0xfffa, 3)

    if (options.config) {
      const data = fs.readFileSync(options.config)
      const str = String.fromCharCode.apply('', data)
      const json = eval(`(${str})`)
      if (json.stopPoints) {
        for (let adr of json.stopPoints) {
          analyzer.addStopPoint(adr)
        }
      }
      if (json.jumpTable) {
        for (let jt of json.jumpTable) {
          analyzer.addJumpTable(jt.address, jt.count)
        }
      }
      if (json.labels) {
        analyzer.setLabelNameTable(json.labels)
      }
    }

    analyzer.analyze()
    analyzer.output()
  })
}

main()
