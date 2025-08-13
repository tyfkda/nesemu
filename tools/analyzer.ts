import fsPromises from 'node:fs/promises'

import {Addressing, Instruction, OpType, kInstTable} from '../src/nes/cpu/inst'
import {kOpcode} from '../src/nes/cpu/disasm'
import {Util} from '../src/util/util'
import {program} from 'commander'

function loadPrgRom(romData: Uint8Array): Uint8Array {
  const start = 16, size = romData[4] * (16 * 1024)
  return new Uint8Array(romData.buffer, start, size)
}

function insert<T>(array: Array<T>, value: any, fn: (elem: any, value: any) => boolean): void {
  const n = array.length
  let i: number
  for (i = 0; i < n; ++i) {
    if (fn(array[i], value))
      break
  }
  array.splice(i, 0, value)
}

function isBranch(opType: OpType): boolean {
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
  public constructor(public start: number, public end: number, public isJumpTable: boolean) {}
}

class Label {
  public isJumpTable = false

  public constructor(public label: string, public isCode: boolean) {}
}

class Analyzer {
  private memory = new Uint8Array(65536)
  private startAdr = 0
  private endAdr = 0
  private entryPoints = new Array<number>()
  private jumpRoutines = new Set<number>()
  private stopAnalyzeAdrs = new Set<number>()
  private labels = new Map<number, Label>()
  private blocks = new Array<Block>()
  private labelNameTable: Record<number, string> = {}

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
    insert(this.entryPoints, adr, (e: number) => adr < e)
  }

  public addJumpRoutine(adr: number): void {
    this.jumpRoutines.add(adr)
  }

  public addStopAnalyze(adr: number): void {
    this.stopAnalyzeAdrs.add(adr)
  }

  public addJumpTable(adr: number, count: number): void {
    this.createBlock(adr, adr + count * 2, true)
    const label2 = this.addLabel(adr, false)
    label2.isJumpTable = true

    for (let i = 0; i < count; ++i) {
      const target = this.read16(adr + i * 2)
      this.addEntryPoint(target)
      this.addLabel(target, true)
    }
  }

  public setLabelNameTable(labelNameTable: Record<number, string>): void {
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
      if (adr == null || this.isInBlock(adr) || adr < this.startAdr)
        continue
      this.analyzeEntry(adr)
    }

    this.removeOverlappedBlocks()
  }

  public output(): void {
    // Labels
    for (let adr of Array.from(this.labels.keys()).sort((a, b) => a - b)) {
      const label = this.labels.get(adr)!
      if (label.isCode || label.isJumpTable)
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

        const size = block.start - prevAdr
        console.log(`\
    ; Unanalyzed: ${Util.hex(prevAdr, 4)} - ${Util.hex(block.start - 1, 4)} (${size} bytes)`)
        for (let i = 0; i < size; i += 16) {
          const s = [...Array(Math.min(16, size - i))]
              .map((_, j) => `$${Util.hex(this.memory[prevAdr + i + j])}`)
              .join(', ')
          console.log(`    .db ${s}`)
        }
      }
      prevAdr = block.end

      if (block.isJumpTable)
        this.outputJumpTable(block)
      else
        this.outputCodeBlock(block)
    }
    if (prevAdr < this.endAdr) {
      console.log(`\n; Unanalyzed: ${Util.hex(prevAdr, 4)} - ${Util.hex(this.endAdr, 4)}`)
    }
  }

  private outputCodeBlock(block: Block): void {
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

  private outputJumpTable(block: Block): void {
    const label = this.labels.get(block.start)
    if (label)
      console.log(`${label.label}:`)
    else
      console.log(`;; ${Util.hex(block.start, 4)}:`)

    const n = (block.end - block.start) / 2 | 0
    for (let i = 0; i < n; ++i) {
      const adr = block.start + i * 2
      const x = this.read16(adr)
      console.log(`    .dw ${this.getLabelName(x)}    ; ${Util.hex(adr, 4)}: $${Util.hex(x, 4)}`)
    }
    console.log('')
  }

  private analyzeEntry(adr: number): void {
    this.addLabel(adr, true)
    const block = this.createBlock(adr)
    while (adr <= 0xffff) {
      if (this.stopAnalyzeAdrs.has(adr))
        break

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
        const label = this.labels.get(target - 1)
        if (label == null || !label.isJumpTable)
          this.addLabel(target, false)
      }

      if (inst.opType === OpType.JMP ||
          inst.opType === OpType.RTS ||
          inst.opType === OpType.RTI ||
          (inst.opType === OpType.JSR && this.jumpRoutines.has(this.read16(adr + 1)))) {
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
        if (block2.isJumpTable && block.end === block2.start) {
          continue
        }

        if (block2.start < block.end && block2.end <= block.end) {
          // Contained, remove.
          this.blocks.splice(j, 1)
          --i
        }
        break
      }
    }
  }

  private step(mem: Uint8Array, pc: number): number {
    const op = mem[pc]
    const inst = kInstTable[op]

    const bins = new Array<string>()
    let asmStr = ''
    if (inst.opType === OpType.UNKNOWN) {
      asmStr = `.db $${Util.hex(op)}`
      bins.push(Util.hex(op, 2))
    } else {
      for (let i = 0; i < inst.bytes; ++i) {
        const m = mem[pc + i]
        bins.push(Util.hex(m, 2))
      }
      asmStr = this.disassemble(inst, mem, pc + 1, pc)
    }

    const binStr = bins.join(' ')
    const pad = ' '.repeat(32 - asmStr.length)
    console.log(`    ${asmStr}${pad}; ${Util.hex(pc, 4)}: ${binStr}`)
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
    case Addressing.ABSOLUTE_X:
    case Addressing.ABSOLUTE_Y:
      {
        const adr = mem[start] | (mem[start + 1] << 8)
        const highLabel = this.labels.get(adr - 1)
        const s = (highLabel == null || !highLabel.isJumpTable) ? this.getLabelName(adr) : `${highLabel.label}+1`
        let post = ''
        switch (inst.addressing) {
        case Addressing.ABSOLUTE_X:  post = ', X';  break
        case Addressing.ABSOLUTE_Y:  post = ', Y';  break
        default:  break;
        }
        operand = ` ${s}${post}`
      }
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
      console.error(`Unhandled addressing: ${inst.addressing} at ${Util.hex(pc, 4)}, op=${Util.hex(mem[pc])}`)
      break
    }
    if (kOpcode[inst.opType] == null)
      throw `kOpcode[${inst.opType}] is null`
    return `${kOpcode[inst.opType]}${operand}`
  }

  private createBlock(adr: number, end: number = 0, isJumpTable = false): Block {
    if (end === 0)
      end = adr
    const block = new Block(adr, end, isJumpTable)
    insert(this.blocks, block, (b: Block) => adr < b.start)
    return block
  }

  private addLabel(adr: number, isCode: boolean): Label {
    let label = this.labels.get(adr)
    if (label == null) {
      label = new Label(this.getLabelName(adr), isCode)
      this.labels.set(adr, label)
    } else {
      label.isCode ||= isCode
    }
    return label
  }

  private getLabelName(adr: number): string {
    return this.labelNameTable[adr] || `L${Util.hex(adr, 4)}`
  }
}

async function main(argv: string[]): Promise<void> {
  program
    .option('-c, --config <path>', 'Config file')
    .allowExcessArguments()
    .parse(argv)
  const options = program.opts()
  const targets = program.args

  if (targets.length <= 0) {
    console.error('arg: [.nes file]')
    process.exit(1)
  }

  const data = await fsPromises.readFile(targets[0])
  const analyzer = new Analyzer()
  const prgRom = loadPrgRom(data)
  analyzer.loadProgram(prgRom, 0x10000 - Math.min(prgRom.byteLength, 0x8000))

  if (options.config) {
    const str = await fsPromises.readFile(options.config, 'utf8')
    const json = eval(`(${str})`)
    if (json.jumpRoutines) {
      for (let adr of json.jumpRoutines) {
        analyzer.addJumpRoutine(adr)
      }
    }
    if (json.stopAnalyze) {
      for (let adr of json.stopAnalyze) {
        analyzer.addStopAnalyze(adr)
      }
    }
    if (json.labels) {
      analyzer.setLabelNameTable(json.labels)
    }
    if (json.jumpTable) {
      for (let jt of json.jumpTable) {
        analyzer.addJumpTable(jt.address, jt.count)
      }
    }
  }
  analyzer.addJumpTable(0xfffa, 3)

  analyzer.analyze()
  analyzer.output()
}

main(process.argv)
