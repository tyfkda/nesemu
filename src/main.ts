///<reference path="../decl/patch.d.ts" />

import {Nes} from './nes/nes.ts'
import {Cpu6502} from './nes/cpu.ts'
import {Addressing, Instruction, OpType} from './nes/inst.ts'
import {disassemble} from './nes/disasm.ts'
import {Util} from './nes/util.ts'

import {PadKeyHandler} from './pad_key_handler.ts'

import WindowManager from './wnd/window_manager.ts'
import Wnd from './wnd/wnd.ts'
import {ScreenWnd, PaletWnd, NameTableWnd, PatternTableWnd} from './ui/ui.ts'

// Request Animation Frame
window.requestAnimationFrame = (function() {
  return (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame || window.msRequestAnimationFrame)
})()

export class RegisterWnd extends Wnd {
  private nes: Nes
  private valueElems: HTMLInputElement[]

  public constructor(wndMgr: WindowManager, nes: Nes) {
    const root = document.createElement('div')
    root.className = 'fixed-font'
    super(wndMgr, 100, 160, 'Regs', root)
    this.nes = nes
    this.createContent(root)
  }

  public updateStatus(): void {
    const cpu = this.nes.cpu
    this.valueElems[0].value = Util.hex(cpu.pc, 4)
    this.valueElems[1].value = Util.hex(cpu.a, 2)
    this.valueElems[2].value = Util.hex(cpu.x, 2)
    this.valueElems[3].value = Util.hex(cpu.y, 2)
    this.valueElems[4].value = Util.hex(cpu.s, 2)
    this.valueElems[5].value = Util.hex(cpu.p, 2)
    this.valueElems[6].value = String(cpu.cycleCount)
  }

  private createContent(root: HTMLElement): void {
    const kElems = [
      { name: 'PC' },
      { name: 'A' },
      { name: 'X' },
      { name: 'Y' },
      { name: 'S' },
      { name: 'P' },
      { name: 'cycle' },
    ]
    const table = document.createElement('table')
    table.style.fontSize = '10px'
    table.style.width = '100%'
    this.valueElems = [] as HTMLInputElement[]
    for (let i = 0; i < kElems.length; ++i) {
      const tr = document.createElement('tr')
      table.appendChild(tr)
      const name = document.createElement('td')
      name.innerText = kElems[i].name
      tr.appendChild(name)
      const value = document.createElement('td')
      tr.appendChild(value)
      const valueInput = document.createElement('input')
      valueInput.type = 'text'
      valueInput.style.width = '100%'
      value.appendChild(valueInput)
      this.valueElems.push(valueInput)
    }
    root.appendChild(table)
  }
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
  return function(regWnd: RegisterWnd, cpu: Cpu6502) {
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
    regWnd.updateStatus()
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

class App {
  private wndMgr: WindowManager
  private nes: Nes
  private padKeyHandler: PadKeyHandler
  private registerWnd: RegisterWnd

  private stepElem: HTMLElement
  private runElem: HTMLElement
  private pauseElem: HTMLElement
  private resetElem: HTMLElement

  public static create(root: HTMLElement): App {
    return new App(root)
  }

  constructor(private root: HTMLElement) {
    this.wndMgr = new WindowManager(root)

    this.nes = Nes.create()
    window['nes'] = this.nes  // Put nes into global.

    const screenWnd = new ScreenWnd(this.wndMgr, this.nes)
    this.wndMgr.add(screenWnd)
    screenWnd.setPos(0, 0)

    const paletWnd = new PaletWnd(this.wndMgr, this.nes)
    this.wndMgr.add(paletWnd)
    paletWnd.setPos(520, 0)

    const nameTableWnd = new NameTableWnd(this.wndMgr, this.nes)
    this.wndMgr.add(nameTableWnd)
    nameTableWnd.setPos(520, 40)

    const patternTableWnd = new PatternTableWnd(this.wndMgr, this.nes)
    this.wndMgr.add(patternTableWnd)
    patternTableWnd.setPos(520, 300)

    this.registerWnd = new RegisterWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.registerWnd)
    this.registerWnd.setPos(1040, 0)

    this.nes.cpu.pause(true)
    this.nes.reset()

    dumpCpu(this.registerWnd, this.nes.cpu)

    this.stepElem = document.getElementById('step')
    this.runElem = document.getElementById('run')
    this.pauseElem = document.getElementById('pause')
    this.resetElem = document.getElementById('reset')

    this.stepElem.addEventListener('click', () => {
      const paused = this.nes.cpu.isPaused()
      this.nes.cpu.pause(false)
      this.nes.step()
      if (paused)
        this.nes.cpu.pause(true)
      dumpCpu(this.registerWnd, this.nes.cpu)
      this.render()
    })
    this.runElem.addEventListener('click', () => {
      this.nes.cpu.pause(false)
      this.updateButtonState()
    })
    this.pauseElem.addEventListener('click', () => {
      this.nes.cpu.pause(true)
      this.updateButtonState()
      dumpCpu(this.registerWnd, this.nes.cpu)
    })
    this.resetElem.addEventListener('click', () => {
      this.nes.reset()
      clearConsole()
      dumpCpu(this.registerWnd, this.nes.cpu)
    })

    const captureElem = document.getElementById('capture')
    captureElem.addEventListener('click', () => {
      const img = document.getElementById('captured-image') as HTMLImageElement
      img.src = screenWnd.capture()
      img.style.visibility = 'visible'
    })

    this.padKeyHandler = new PadKeyHandler()
    this.setUpKeyEvent(root, this.padKeyHandler)

    // Handle file drop.
    if (window.File && window.FileReader && window.FileList && window.Blob) {
      handleFileDrop(root, (romData) => { this.loadRom(romData) })
    }

    this.startLoopAnimation()
  }

  private startLoopAnimation(): void {
    let lastTime = window.performance.now()
    const loopFn = () => {
      const curTime = window.performance.now()
      const elapsedTime = curTime - lastTime
      lastTime = curTime

      this.loop(elapsedTime)
      requestAnimationFrame(loopFn)
    }
    requestAnimationFrame(loopFn)
  }

  private loop(elapsedTime: number): void {
    const MAX_ELAPSED_TIME = 1000 / 20
    if (!this.nes.cpu.isPaused()) {
      this.nes.setPadStatus(0, this.padKeyHandler.getStatus(0))
      this.nes.setPadStatus(1, this.padKeyHandler.getStatus(1))

      const et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
      let cycles = (1789773 * et / 1000) | 0
      this.nes.runCycles(cycles)
      this.render()
    }
  }

  private render(): void {
    this.wndMgr.update()
  }

  private loadRom(romData: Uint8Array): boolean {
    if (!this.nes.setRomData(romData)) {
      alert(`Illegal ROM format`)
      return false
    }
    this.nes.reset()
    this.nes.cpu.pause(false)
    clearConsole()
    dumpCpu(this.registerWnd, this.nes.cpu)
    this.updateButtonState()
    this.root.focus()
    return true
  }

  private updateButtonState(): void {
    const paused = this.nes.cpu.isPaused()
    this.pauseElem.disabled = paused
    this.runElem.disabled = this.stepElem.disabled = !paused
  }

  private setUpKeyEvent(root: HTMLElement, padKeyHandler: PadKeyHandler): void {
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
  }
}

window.addEventListener('load', () => {
  const root = document.getElementById('nesroot')
  App.create(root)
})
