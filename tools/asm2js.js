// 6502 assembler to JavaScript converter.
(() => {
  'use strict'

  const readline = require('readline')

  function readAllLine(input, lineCb, endCb) {
    const reader = readline.createInterface({
      input,
    })
    reader.on('line', (line) => {
      lineCb(line)
    })
    reader.on('close', () => {
      if (endCb)
        endCb()
    })
  }

  function formatNumLiteral(literal) {
    let p = literal

    function parseAtom() {
      p = p.trimLeft()
      if (p[0] === '<') {
        p = p.substring(1)
        return `LO(${parseAtom()})`
      }
      if (p[0] === '>') {
        p = p.substring(1)
        return `HI(${parseAtom()})`
      }

      let m
      m = p.match(/^\$([0-9a-fA-F]+)(.*)$/)
      if (m) {
        p = m[2]
        return `0x${m[1]}`
      }
      m = p.match(/^%([01]+)(.*)$/)
      if (m) {
        p = m[2]
        return `0x${parseInt(m[1], 2).toString(16)}`
      }
      m = p.match(/^(\w+)(.*)/)
      if (m) {
        p = m[2]
        return m[1]
      }
      return null
    }

    function parseExp() {
      const t1 = parseAtom()
      if (t1 == null)
        return null
      const m = p.match(/^\s*([+\-*\/<>])(.*)/)
      if (!m)
        return t1
      p = m[2]
      const op = m[1]
      const t2 = parseExp()
      if (t2 == null)
        return null
      return `${t1} ${op} ${t2}`
    }

    const result = parseExp()
    if (result == null || p.trim() !== '') {
      throw new Error(`Illegal expression: ${literal} (at ${p})`)
    }
    return result
  }

  class Line {
    constructor() {
      this.pcNo = -1
    }
  }

  class Comment extends Line {
    constructor(comment) {
      super()
      this.comment = comment
    }

    toString() {
      return `// ${this.comment}`
    }
  }

  class Definition extends Line {
    constructor(name, value, comment) {
      super()
      this.name = name
      this.value = value
      this.comment = comment
    }

    toString() {
      const valStr = formatNumLiteral(this.value)
      return `${this.name} = ${valStr}  ${this.comment ? '// ' + this.comment : ''}`
    }
  }

  class Directive extends Line {
    constructor(opcode, operand, comment) {
      super()
      this.opcode = opcode
      this.operand = operand
      this.comment = comment
    }

    toString() {
      return `\t//${this.opcode}${this.operand ? '\t' + this.operand : ''}  ${this.comment ? '// ' + this.comment : ''}`
    }
  }

  class Label extends Line {
    constructor(name, comment) {
      super()
      this.name = name
      this.comment = comment
      this.isRomDataLabel = false
    }

    toString() {
      return `${this.name}: (${this.pcNo})  ${this.comment ? '// ' + this.comment : ''}`
    }
  }

  class Op extends Line {
    constructor(opcode, operand, comment) {
      super()
      this.opcode = opcode.trim().toUpperCase()
      this.operand = (operand ? operand : '').trim()
      this.comment = comment
    }

    toString() {
      switch (this.opcode) {
      case 'LDA':
      case 'LDX':
      case 'LDY':
        return this.toStringLD()
      case 'STA':
      case 'STX':
      case 'STY':
        return this.toStringST()
      case 'CMP':
      case 'CPX':
      case 'CPY':
      case 'ADC':
      case 'SBC':
      case 'AND':
      case 'ORA':
      case 'EOR':
      case 'INC':
      case 'INX':
      case 'INY':
      case 'DEC':
      case 'DEX':
      case 'DEY':
      case 'ROL':
      case 'ROR':
      case 'ASL':
      case 'LSR':
      case 'BIT':
        return this.toStringARITH()
      case 'BNE':
      case 'BEQ':
      case 'BPL':
      case 'BCS':
      case 'BCC':
        return `\tif(${this.opcode}()) {pc=${this.operand}; break}  ${this.comment ? '// ' + this.comment : ''}`
      case 'JMP':
        return this.toStringJMP()
      case 'JSR':
        return `\tpc=${this.opcode}(pc, ${this.operand}); break  ${this.comment ? '// ' + this.comment : ''}`
      case 'RTS':
      case 'RTI':
        return `\tpc=${this.opcode}(${this.operand ? this.operand : ''}); break  ${this.comment ? '// ' + this.comment : ''}`
      case 'CALLJS':
        return `\t${this.operand}  ${this.comment ? '// ' + this.comment : ''}`
      default:
        return `\t${this.opcode}(${this.operand ? this.operand : ''})  ${this.comment ? '// ' + this.comment : ''}`
      }
    }

    toStringLD() {
      const operands = this.operand.split(',')
      switch (operands.length) {
      case 1:
        {
          let literal
          let postfix
          if (operands[0][0] === '#') {
            literal = formatNumLiteral(operands[0].substring(1))
            postfix = '_immediate'
          } else {
            literal = formatNumLiteral(operands[0])
            postfix = '_absolute'
          }
          return `\t${this.opcode}${postfix}(${literal})  ${this.comment ? '// ' + this.comment : ''}`
        }
      case 2:
        {
          const first = operands[0].trim()
          const second = operands[1].trim().toLowerCase()
          const m = first.match(/^\((.*)\)$/)
          if (m) {
            return `\t${this.opcode}_indirect_${second}(${formatNumLiteral(m[1])})  ${this.comment ? '// ' + this.comment : ''}`
          } else {
            return `\t${this.opcode}_${second}(${formatNumLiteral(operands[0])})  ${this.comment ? '// ' + this.comment : ''}`
          }
        }
      }
      return `\t${this.opcode}(${this.operand ? this.operand : ''})  ${this.comment ? '// ' + this.comment : ''}`
    }

    toStringST() {
      const operands = this.operand.split(',')
      switch (operands.length) {
      case 1:
        {
          let literal
          let postfix
          if (operands[0][0] === '#') {
            literal = formatNumLiteral(operands[0].substring(1))
            postfix = '_immediate'
          } else {
            literal = formatNumLiteral(operands[0])
            postfix = '_absolute'
          }
          return `\t${this.opcode}${postfix}(${literal})  ${this.comment ? '// ' + this.comment : ''}`
        }
      case 2:
        {
          const first = operands[0].trim()
          const second = operands[1].trim().toLowerCase()
          const m = first.match(/^\((.*)\)$/)
          if (m) {
            return `\t${this.opcode}_indirect_${second}(${formatNumLiteral(m[1])})  ${this.comment ? '// ' + this.comment : ''}`
          } else {
            return `\t${this.opcode}_${second}(${formatNumLiteral(operands[0])})  ${this.comment ? '// ' + this.comment : ''}`
          }
        }
      }
      return `\t${this.opcode}(${this.operand ? this.operand : ''})  ${this.comment ? '// ' + this.comment : ''}`
    }

    toStringARITH() {
      if (!this.operand)
        return `\t${this.opcode}()  ${this.comment ? '// ' + this.comment : ''}`

      const operands = this.operand.split(',')
      switch (operands.length) {
      case 1:
        {
          let literal
          let postfix
          if (operands[0][0] === '#') {
            literal = formatNumLiteral(operands[0].substring(1))
            postfix = '_immediate'
          } else {
            literal = formatNumLiteral(operands[0])
            postfix = '_absolute'
          }
          return `\t${this.opcode}${postfix}(${literal})  ${this.comment ? '// ' + this.comment : ''}`
        }
      case 2:
        {
          const first = operands[0].trim()
          const second = operands[1].trim().toLowerCase()
          const m = first.match(/^\((.*)\)$/)
          if (m) {
            return `\t${this.opcode}_indirect_${second}(${formatNumLiteral(m[1])})  ${this.comment ? '// ' + this.comment : ''}`
          } else {
            return `\t${this.opcode}_${second}(${formatNumLiteral(operands[0])})  ${this.comment ? '// ' + this.comment : ''}`
          }
        }
      }
      return `\t${this.opcode}(${this.operand ? this.operand : ''})  ${this.comment ? '// ' + this.comment : ''}`
    }

    toStringJMP() {
      const m = this.operand.match(/^\((.*)\)$/)
      if (m) {
        return `\tpc=${this.opcode}_indirect(${formatNumLiteral(m[1])}); break  ${this.comment ? '// ' + this.comment : ''}`
      } else {
        return `\tpc=${this.opcode}(${this.operand}); break  ${this.comment ? '// ' + this.comment : ''}`
      }
    }
  }

  class ByteData {
    constructor(label, directives) {
      this.label = label

      // データ生成
      const data = []
      for (let d of directives) {
        for (let e of d.operand.split(',')) {
          data.push(e.trim())
        }
      }
      this.data = data
    }

    getSize() {
      return this.data.length
    }
  }

  function parseMnemonic(opcode, operand, comment) {
    return new Op(opcode, operand, comment)
  }

  function parseLine(line) {
    let m
    m = line.match(/^\s*$/)
    if (m)
      return new Comment('')

    m = line.match(/^\s*;(.*)$/)
    if (m)
      return new Comment(m[1])

    m = line.match(/^(\w+)\s*=\s*([^;]*)(;(.*))?$/)
    if (m)
      return new Definition(m[1], m[2], m[4])

    m = line.match(/^\s+(\.\w+)(\s+([^;]*))?(\s*;(.*))?$/)
    if (m)
      return new Directive(m[1], m[3], m[5])

    m = line.match(/^(\w+):(\s*;(.*))?$/)
    if (m)
      return new Label(m[1], m[3])

    m = line.match(/^(\w+):\s+(\w+)(\s+([^;]*))?(\s*;(.*))?$/)
    if (m) {
      const op = parseMnemonic(m[2], m[4], m[6])
      if (op)
        return [new Label(m[1]), op]
    }

    m = line.match(/^(\w+):\s+(\.\w+)(\s+([^;]*))?(\s*;(.*))?$/)
    if (m) {
      return [new Label(m[1]),
              new Directive(m[2], m[4], m[6])]
    }

    m = line.match(/^\s+(\w+)(\s+([^;]*))?(\s*;(.*))?$/)
    if (m) {
      const op = parseMnemonic(m[1], m[3], m[5])
      if (op)
        return op
    }
    return null
  }

  // ================================================
  class Converter{
    constructor(lines) {
      this.lines = lines
    }

    buildLabels() {
      this.doOutputProgram(0)
    }

    outputLabels() {
      // Call after buildLabels()
      console.log('  // Lables')
      for (let line of this.lines) {
        if ((line instanceof Label) && !line.isRomDataLabel) {
          console.log(`  const ${line.name} = ${line.pcNo}`)
        }
      }

      // Rom data addresses
      console.log('\n  // Rom data addresses')
      for (let rd of this.romData) {
        console.log(`  const ${rd.label.name} = 0x${rd.label.pcNo.toString(16)}`)
      }
    }

    outputDefinitions() {
      console.log('  // Definitions')
      for (let line of this.lines) {
        if (line instanceof Definition) {
          console.log(`  const ${line.toString()}`.trimRight())
        }
      }
    }

    listupRomData() {
      let addr = 0x8000
      this.romData = []
      for (let i = 0; i < this.lines.length; ++i) {
        const line = this.lines[i]
        if (!(line instanceof Label))
          continue

        const label = line
        // Directive
        let j = i
        for (; ++j < this.lines.length;) {
          if (!(this.lines[j] instanceof Directive) ||
              this.lines[j].opcode !== '.db')
            break
        }
        if (j === i + 1) {
          // データが続いていない：
          // 複数のラベルが並んだ後にデータが来ているかチェック
          for (j = i; ++j < this.lines.length;) {
            if (!(this.lines[j] instanceof Label))
              break
          }
          if (j < this.lines.length && (this.lines[j] instanceof Directive) &&
              this.lines[j].opcode === '.db') {
            label.isRomDataLabel = true
            label.pcNo = addr
            const directives = []
            const byteData = new ByteData(label, directives)
            this.romData.push(byteData)
            // No need to add addr, because the size equals 0.
          }
        } else {
          label.isRomDataLabel = true
          label.pcNo = addr
          const directives = this.lines.slice(i + 1, j)
          const byteData = new ByteData(label, directives)
          this.romData.push(byteData)
          addr += byteData.getSize()
        }
      }
    }

    outputRomData() {
      console.log(`
  // Rom data
  const ROM_DATA = [`)
      let totalSize = 0
      for (let rd of this.romData) {
        console.log(`    // ${rd.label.name}: 0x${rd.label.pcNo.toString(16)}`)
        if (rd.data.length === 0) {
          console.log(`    // Empty`)
        } else {
          const data = rd.data.map(d => formatNumLiteral(d)).join(', ')
          console.log(`    ${data},`)
        }
        totalSize += rd.getSize()
      }
      console.log(`  ]  // Total size: ${totalSize}`)
    }

    outputProgram() {
      console.log(`
function step(pc) {
  switch (pc) {
  case -1:  // Dummy
`)

      const pc = this.doOutputProgram(1)

      console.log(`\
    pc=${pc}; case ${pc}: break
  }
  return pc
}`)
    }

    doOutputProgram(pass) {
      let pc = 0
      let emptyLineCount = 0
      for (let i = 0; i < this.lines.length; ++i) {
        let line = this.lines[i]
        let s
        let emptyLine = false
        if (!((line instanceof Label) && line.isRomDataLabel))
          line.pcNo = pc
        if (line instanceof Comment) {
          emptyLine = !line.comment
          s = `${line.toString()}`
        } else if (line instanceof Directive) {
          s = `// ${line.toString()}`
        } else if (line instanceof Definition) {
          emptyLine = true
          s = '//'
        } else if (line instanceof Label) {
          s = `// ${line.toString()}`
        } else {
          s = `  pc=${pc}; break; case ${pc}: ${line.toString()}`
          ++pc
        }
        if (pass === 1) {
          if (!emptyLine) {
            emptyLineCount = 0
          } else {
            ++emptyLineCount
            if (emptyLineCount > 1)
              s = null
          }
          if (s) {
            console.log(s.trimRight())
          } else {
          }
        }
      }
      return pc
    }
  }

  const lines = []
  readAllLine(process.stdin, (line) => {
    let item = parseLine(line)
    if (item != null) {
      if (Array.isArray(item))
        Array.prototype.push.apply(lines, item)
      else
        lines.push(item)
    } else {
      console.error(`Unknown line: ${line}`)
    }
  }, () => {
    const converter = new Converter(lines)
    converter.listupRomData()
    // Buid labels
    converter.buildLabels()
    converter.outputLabels()
    converter.outputDefinitions()
    converter.outputRomData()
    converter.outputProgram()
  })
})()
