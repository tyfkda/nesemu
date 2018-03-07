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
    if (literal[0] === '<')
      return `LO(${formatNumLiteral(literal.substring(1))})`
    if (literal[0] === '>')
      return `HI(${formatNumLiteral(literal.substring(1))})`

    let m
    m = literal.match(/^\$([0-9a-fA-F]+)$/)
    if (m)
      return `0x${m[1]}`
    m = literal.match(/^%([01]+)$/)
    if (m)
      return `0x${parseInt(m[1], 2).toString(16)}`
    return literal
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
            return `\t${this.opcode}_${second}(${operands[0]})  ${this.comment ? '// ' + this.comment : ''}`
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
            return `\t${this.opcode}_${second}(${operands[0]})  ${this.comment ? '// ' + this.comment : ''}`
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
            return `\t${this.opcode}_${second}(${operands[0]})  ${this.comment ? '// ' + this.comment : ''}`
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

    m = line.match(/^(\w+)\s*=\s*([<>]?\$[0-9a-fA-F]+|[0-9]+|%[01]+)(\s+;(.*))?$/)
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

  function outputDefinitions(lines) {
    console.log('  // Definitions')
    for (let line of lines) {
      if (line instanceof Definition) {
        console.log(`  const ${line.toString()}`.trimRight())
      }
    }
  }

  function outputProgram(lines, pass) {
    if (pass === 1) {
      // Labels
      console.log('  // Lables')
      for (let line of lines) {
        if (line instanceof Label) {
          console.log(`  const ${line.name} = ${line.pcNo}`)
        }
      }

      console.log(`
function step(pc) {
  switch (pc) {
  case -1:  // Dummy
`)
    }
    let pc = 0
    let emptyLineCount = 0
    for (let i = 0; i < lines.length; ++i) {
      let line = lines[i]
      let s
      let emptyLine = false
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
    if (pass === 1) {
      console.log(`\
    pc=${pc}; case ${pc}: break
  }
  return pc
}`)
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
    // Definitions first.
    outputDefinitions(lines)

    // Lines.
    for (let pass = 0; pass < 2; ++pass)
      outputProgram(lines, pass)
  })

})()
