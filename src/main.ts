///<reference path="../decl/patch.d.ts" />

import {Nes} from './nes/nes.ts'
import {Cpu6502} from './nes/cpu.ts'
import {Util} from './nes/util.ts'

declare var kRomData: number[]

const FPS = 60

function loadPrgRom(romData: number[]): Uint8ClampedArray {
  const start = 16, size = 16 * 1024
  const prg = romData.slice(start, start + size)
  return new Uint8ClampedArray(prg)
}

function loadChrRom(romData: number[]): Uint8ClampedArray {
  const start = 16 + 16 * 1024, size = 8 * 1024
  const chr = romData.slice(start, start + size)
  return new Uint8ClampedArray(chr)
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
  const root = document.getElementById('nesroot')
  const canvas = document.createElement('canvas')
  canvas.style.imageRendering = 'pixelated'
  const scale = 2
  canvas.style.width = `${256 * scale}px`
  canvas.style.height = `${240 * scale}px`
  root.appendChild(canvas)

  const nes = Nes.create(canvas)
  ;(window as any).nes = nes  // Put nes into global.

  const prgRom = loadPrgRom(kRomData)
  const chrRom = loadChrRom(kRomData)
  nes.setRomData(prgRom, chrRom)
  nes.reset()
  nes.cpu.pause(true)

  dumpCpu(nes.cpu)

  const stepElem = document.getElementById('step')
  const runElem = document.getElementById('run')
  const pauseElem = document.getElementById('pause')
  const resetElem = document.getElementById('reset')

  const updateButtonState = () => {
    const paused = nes.cpu.isPaused()
    pauseElem.disabled = paused
    runElem.disabled = stepElem.disabled = !paused
  }

  stepElem.addEventListener('click', () => {
    const paused = nes.cpu.isPaused()
    nes.cpu.pause(false)
    nes.step()
    if (paused)
      nes.cpu.pause(true)
    dumpCpu(nes.cpu)
    nes.render()
  })
  runElem.addEventListener('click', () => {
    nes.cpu.pause(false)
    updateButtonState()
  })
  pauseElem.addEventListener('click', () => {
    nes.cpu.pause(true)
    updateButtonState()
  })
  resetElem.addEventListener('click', () => {
    nes.reset()
    clearConsole()
    dumpCpu(nes.cpu)
  })

  document.getElementById('capture').addEventListener('click', () => {
    const dataUrl = canvas.toDataURL()
    const img = document.getElementById('captured-image') as HTMLImageElement
    img.src = dataUrl
    img.style.visibility = 'visible'
  })

  setInterval(() => {
    if (!nes.cpu.isPaused()) {
      // TODO: Calculate cpu cycles from elapsed time.
      let cycles = (1.79 * 1000000 / FPS) | 0
      nes.runCycles(cycles)
      dumpCpu(nes.cpu)
      nes.render()
      updateButtonState()
    }
  }, 1000 / FPS)
}

window.addEventListener('load', () => {
  nesTest()
})
