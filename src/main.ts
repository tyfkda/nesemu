///<reference path="../decl/patch.d.ts" />

import {Nes} from './nes/nes.ts'
import {Cpu6502} from './nes/cpu.ts'
import {Addressing, Instruction, OpType} from './nes/inst.ts'
import {disassemble} from './nes/disasm.ts'
import {Util} from './nes/util.ts'

import {PadKeyHandler} from './pad_key_handler.ts'

import WindowManager from './wnd/window_manager.ts'
import Wnd from './wnd/wnd.ts'
import {PaletWnd, NameTableWnd} from './ui/ui.ts'

// Request Animation Frame
window.requestAnimationFrame = (function() {
  return (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame || window.msRequestAnimationFrame)
})()

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

const {putConsole, clearConsole} = (function() {
  const lines = []
  const MAX_LINE = 100
  const cons = document.getElementById('console') as HTMLTextAreaElement
  return {
    putConsole: function(line) {
      lines.push(line)
      if (lines.length > MAX_LINE)
        lines.shift()
      cons.value = lines.join('\n')
      cons.scrollTop = cons.scrollHeight
    },
    clearConsole: function() {
      cons.value = ''
      lines.length = 0
    },
  }
})()

const kIllegalInstruction: Instruction = {
  opType: OpType.UNKNOWN,
  addressing: Addressing.UNKNOWN,
  bytes: 1,
  cycle: 0,
}

const dumpCpu = (() => {
  const MAX_BYTES = 3
  const mem = new Uint8Array(MAX_BYTES)
  const bins = new Array(MAX_BYTES)
  return function(cpu: Cpu6502) {
    const op = cpu.read8Raw(cpu.pc)
    const inst = Cpu6502.getInst(op) || kIllegalInstruction

    for (let i = 0; i < inst.bytes; ++i) {
      const m = cpu.read8Raw(cpu.pc + i)
      mem[i] = m
      bins[i] = Util.hex(m, 2)
    }
    for (let i = inst.bytes; i < MAX_BYTES; ++i)
      bins[i] = '  '
    const line = `${Util.hex(cpu.pc, 4)}: ${bins.join(' ')}   ${disassemble(inst, mem, 1, cpu.pc)}`
    putConsole(line)
    showCpuStatus(cpu)
  }
})()

function handleFileDrop(dropZone, onDropped) {
  function onDrop(evt) {
    evt.stopPropagation()
    evt.preventDefault()
    const files = evt.dataTransfer.files
    if (files.length > 0) {
      const reader = new FileReader()
      reader.onload = function(e) {
        const binary = new Uint8Array((e.target as any).result)
        onDropped(binary)
      }
      reader.readAsArrayBuffer(files[0])
    }
    return false
  }

  function onDragOver(evt) {
    evt.stopPropagation()
    evt.preventDefault()
    evt.dataTransfer.dropEffect = 'copy'
    return false
  }

  dropZone.addEventListener('dragover', onDragOver, false)
  dropZone.addEventListener('drop', onDrop, false)
}

function clearCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')
  context.strokeStyle = ''
  context.fillStyle = `rgb(255,0,255)`
  context.fillRect(0, 0, canvas.width, canvas.height)
}

function nesTest() {
  const root = document.getElementById('nesroot')
  const windowManager = new WindowManager(root)

  const canvas = document.createElement('canvas') as HTMLCanvasElement
  canvas.style.width = '512px'
  canvas.style.height = '480px'
  canvas.className = 'pixelated'
  clearCanvas(canvas)
  const tvWnd = new Wnd(512, 480, 'NES', canvas)
  windowManager.add(tvWnd)
  tvWnd.setPos(0, 0)

  const nes = Nes.create(canvas)
  ;(window as any).nes = nes  // Put nes into global.

  const paletWnd = new PaletWnd(nes)
  windowManager.add(paletWnd)
  paletWnd.setPos(530, 0)

  const nameTableWnd = new NameTableWnd(nes)
  windowManager.add(nameTableWnd)
  nameTableWnd.setPos(530, 50)

  const onRomLoaded = (romData): boolean => {
    return nes.setRomData(romData)
  }

  nes.cpu.pause(true)
  nes.reset()

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

  const render = () => {
    nes.render()
    windowManager.update()
  }

  stepElem.addEventListener('click', () => {
    const paused = nes.cpu.isPaused()
    nes.cpu.pause(false)
    nes.step()
    if (paused)
      nes.cpu.pause(true)
    dumpCpu(nes.cpu)
    render()
  })
  runElem.addEventListener('click', () => {
    nes.cpu.pause(false)
    updateButtonState()
  })
  pauseElem.addEventListener('click', () => {
    nes.cpu.pause(true)
    updateButtonState()
    dumpCpu(nes.cpu)
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

  const padKeyHandler = new PadKeyHandler()
  root.setAttribute('tabindex', '1')  // To accept key event.
  root.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey)
      return
    event.preventDefault()
    padKeyHandler.onKeyDown(event.keyCode)
  })
  root.addEventListener('keyup', (event) => {
    event.preventDefault()
    padKeyHandler.onKeyUp(event.keyCode)
  })

  let lastTime = window.performance.now()
  requestAnimationFrame(function loop() {
    const MAX_ELAPSED_TIME = 1000 / 20
    const curTime = window.performance.now()
    const elapsedTime = curTime - lastTime
    lastTime = curTime

    nes.setPadStatus(0, padKeyHandler.getStatus(0))
    nes.setPadStatus(1, padKeyHandler.getStatus(1))
    if (!nes.cpu.isPaused()) {
      const et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
      let cycles = (1789773 * et / 1000) | 0
      nes.runCycles(cycles)
      render()
    }
    requestAnimationFrame(loop)
  })

  // Handle file drop.
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    handleFileDrop(root, (romData) => {
      if (!onRomLoaded(romData)) {
        alert(`Illegal ROM format`)
        return
      }
      nes.reset()
      nes.cpu.pause(false)
      clearConsole()
      dumpCpu(nes.cpu)
      updateButtonState()
      root.focus()
    })
  }
}

window.addEventListener('load', () => {
  nesTest()
})
