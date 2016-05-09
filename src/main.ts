import {NesEmu} from './nesemu.ts'

import {Cpu6502} from './cpu.ts'
import {kRomData} from './,romdata.ts'
import {Util} from './util.ts'

function loadPrgRom(romData: number[]): Uint8Array {
  const prg = romData.slice(16, 16 + 16 * 1024)
  return new Uint8Array(prg)
}

function showCpuStatus(cpu: Cpu6502): void {
  const e = id => document.getElementById(id) as HTMLInputElement
  e('reg-pc').value = Util.hex(cpu.pc, 4)
  e('reg-a').value = Util.hex(cpu.a, 2)
  e('reg-x').value = Util.hex(cpu.x, 2)
  e('reg-y').value = Util.hex(cpu.y, 2)
  e('reg-s').value = Util.hex(cpu.s, 2)
  e('reg-p').value = Util.hex(cpu.p, 2)
  e('cycle-count').value = String(cpu.cycleCount)
}

let putConsole, clearConsole
(function() {
  const lines = []
  const MAX_LINE = 100
  putConsole = function(line) {
    const cons = document.getElementById('console') as HTMLTextAreaElement
    lines.push(line)
    if (lines.length > MAX_LINE)
      lines.shift()
    cons.value = lines.join('\n')
    cons.scrollTop = cons.scrollHeight
  }

  clearConsole = function() {
    const cons = document.getElementById('console') as HTMLTextAreaElement
    cons.value = ''
    lines.length = 0
  }
})()

function dumpCpu(cpu: Cpu6502) {
  const h2 = (x) => Util.hex(x, 2)
  const h4 = (x) => Util.hex(x, 4)
  const op = cpu.read8(cpu.pc)
  const inst = cpu.getInst(op) || {
    bytes: 1,
    mnemonic: '???',
  }

  const MAX_BYTES = 4
  const bins = new Array(MAX_BYTES)
  for (let i = 0; i < inst.bytes; ++i)
    bins[i] = h2(cpu.read8(cpu.pc + i))
  for (let i = inst.bytes; i < MAX_BYTES; ++i)
    bins[i] = '  '
  const line = `${h4(cpu.pc)}: ${bins.join(' ')} ${inst.mnemonic}`
  putConsole(line)
  showCpuStatus(cpu)
}

function nesTest() {
  const nes = NesEmu.create('nesroot')

  const prgRom = loadPrgRom(kRomData)
  nes.setRomData(prgRom)
  nes.reset()

  dumpCpu(nes.cpu)

  document.getElementById('step').addEventListener('click', () => {
    nes.step()
    dumpCpu(nes.cpu)
  })
  document.getElementById('run').addEventListener('click', () => {
    for (let i = 0; i < 100; ++i) {
      nes.step()
      dumpCpu(nes.cpu)
    }
  })
  document.getElementById('reset').addEventListener('click', () => {
    nes.reset()
    clearConsole()
    dumpCpu(nes.cpu)
  })
}

window.addEventListener('load', () => {
  nesTest()
})
