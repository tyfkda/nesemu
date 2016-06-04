///<reference path="../decl/patch.d.ts" />

import {Nes} from './nes/nes.ts'
import {Cpu6502} from './nes/cpu.ts'
import {Addressing, Instruction, OpType} from './nes/inst.ts'
import {disassemble} from './nes/disasm.ts'
import {Util} from './nes/util.ts'

import {AudioManager} from './audio_manager.ts'
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
    this.valueElems[6].value = String(this.nes.cycleCount)
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
      valueInput.className = 'fixed-font'
      valueInput.type = 'text'
      valueInput.style.width = '100%'
      value.appendChild(valueInput)
      this.valueElems.push(valueInput)
    }
    root.appendChild(table)
  }
}

const MAX_BYTES = 3
const MAX_LINE = 100

export class TraceWnd extends Wnd {
  private nes: Nes
  private textarea: HTMLTextAreaElement

  private mem: Uint8Array
  private bins: string[]
  private lines: string[]

  public constructor(wndMgr: WindowManager, nes: Nes) {
    const root = document.createElement('div')
    super(wndMgr, 400, 160, 'Trace', root)
    this.nes = nes
    this.createContent(root)
    this.mem = new Uint8Array(MAX_BYTES)
    this.bins = new Array(MAX_BYTES)
    this.reset()
  }

  public reset(): void {
    this.lines = []
  }

  public updateStatus(): void {
    const cpu = this.nes.cpu
    const op = cpu.read8Raw(cpu.pc)
    const inst = Cpu6502.getInst(op) || kIllegalInstruction

    for (let i = 0; i < inst.bytes; ++i) {
      const m = cpu.read8Raw(cpu.pc + i)
      this.mem[i] = m
      this.bins[i] = Util.hex(m, 2)
    }
    for (let i = inst.bytes; i < MAX_BYTES; ++i)
      this.bins[i] = '  '

    const pcStr = Util.hex(cpu.pc, 4)
    const binStr = this.bins.join(' ')
    const asmStr = disassemble(inst, this.mem, 1, cpu.pc)
    this.putConsole(`${pcStr}: ${binStr}   ${asmStr}`)
  }

  private createContent(root: HTMLElement): void {
    const textarea = document.createElement('textarea')
    textarea.className = 'fixed-font'
    textarea.style.fontSize = '14px'
    textarea.style.width = '100%'
    textarea.style.height = '160px'
    textarea.style.resize = 'none'
    textarea.style.margin = '0'
    textarea.style.padding = '2px'
    textarea.style.border = 'none'
    textarea.style.boxSizing = 'border-box'
    root.appendChild(textarea)
    this.textarea = textarea
  }

  private putConsole(line: string): void {
    this.lines.push(line)
    if (this.lines.length > MAX_LINE)
      this.lines.shift()
    this.textarea.value = this.lines.join('\n')
    this.textarea.scrollTop = this.textarea.scrollHeight
  }
}

class ControlWnd extends Wnd {
  private nes: Nes
  private screenWnd: ScreenWnd
  private audioManager: AudioManager
  private stepBtn: HTMLButtonElement
  private runBtn: HTMLButtonElement
  private pauseBtn: HTMLButtonElement
  private callback: (action) => void

  public constructor(wndMgr: WindowManager, nes: Nes, screenWnd: ScreenWnd,
                     audioManager: AudioManager, callback: (action) => void)
  {
    const root = document.createElement('div')

    super(wndMgr, 384, 32, 'Control', root)
    this.nes = nes
    this.screenWnd = screenWnd
    this.audioManager = audioManager
    this.callback = callback

    this.createElement(root)
    this.updateState(true)
  }

  public updateState(paused: boolean): void {
    this.stepBtn.disabled = paused ? '' : 'disabled'
    this.runBtn.disabled = paused ? '' : 'disabled'
    this.pauseBtn.disabled = paused ? 'disabled' : ''
  }

  private createElement(root: HTMLElement): void {
    root.style.width = '384px'
    root.style.height = '32px'

    this.stepBtn = document.createElement('button') as HTMLButtonElement
    this.stepBtn.innerText = 'Step'
    this.stepBtn.addEventListener('click', () => {
      const paused = this.nes.cpu.isPaused()
      this.nes.cpu.pause(false)
      this.nes.step()
      if (paused)
        this.nes.cpu.pause(true)
      this.callback('step')
    })
    root.appendChild(this.stepBtn)

    this.runBtn = document.createElement('button') as HTMLButtonElement
    this.runBtn.innerText = 'Run'
    this.runBtn.addEventListener('click', () => {
      this.nes.cpu.pause(false)
      this.updateState(false)
    })
    root.appendChild(this.runBtn)

    this.pauseBtn = document.createElement('button') as HTMLButtonElement
    this.pauseBtn.innerText = 'Pause'
    this.pauseBtn.addEventListener('click', () => {
      this.nes.cpu.pause(true)
      this.updateState(true)
      this.callback('paused')
    })
    root.appendChild(this.pauseBtn)

    const resetBtn = document.createElement('button') as HTMLButtonElement
    resetBtn.innerText = 'Reset'
    resetBtn.addEventListener('click', () => {
      this.nes.reset()
      this.callback('reset')
    })
    root.appendChild(resetBtn)

    const captureBtn = document.createElement('button') as HTMLButtonElement
    captureBtn.innerText = 'Capture'
    captureBtn.addEventListener('click', () => {
      const img = document.createElement('img') as HTMLImageElement
      const title = String(Date.now())
      img.src = this.screenWnd.capture()
      img.className = 'pixelated'
      img.style.width = img.style.height = '100%'
      img.title = img.alt = title

      const imgWnd = new Wnd(this.wndMgr, 256, 240, title, img)
      imgWnd.addResizeBox()
      this.wndMgr.add(imgWnd)
    })
    root.appendChild(captureBtn)

    const muteLabel = document.createElement('label')
    const muteBtn = document.createElement('input') as HTMLInputElement
    muteBtn.type = 'checkbox'
    muteBtn.checked = true
    muteBtn.addEventListener('click', () => {
      const volume = muteBtn.checked ? 0.0 : 1.0
      this.audioManager.setMasterVolume(volume)
    })
    muteLabel.appendChild(muteBtn)
    muteLabel.appendChild(document.createTextNode('mute'))
    root.appendChild(muteLabel)
  }
}

const kIllegalInstruction: Instruction = {
  opType: OpType.UNKNOWN,
  addressing: Addressing.UNKNOWN,
  bytes: 1,
  cycle: 0,
}

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
  private audioManager: AudioManager
  private registerWnd: RegisterWnd
  private traceWnd: TraceWnd
  private ctrlWnd: ControlWnd

  public static create(root: HTMLElement): App {
    return new App(root)
  }

  constructor(private root: HTMLElement) {
    this.wndMgr = new WindowManager(root)

    this.nes = Nes.create()
    window.nes = this.nes  // Put nes into global.
    this.nes.setVblankCallback((leftCycles) => { this.onVblank(leftCycles) })
    this.nes.setBreakPointCallback(() => { this.onBreakPoint() })

    this.audioManager = new AudioManager()
    this.audioManager.setMasterVolume(0)

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

    this.traceWnd = new TraceWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.traceWnd)
    this.traceWnd.setPos(0, 500)

    this.registerWnd = new RegisterWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.registerWnd)
    this.registerWnd.setPos(410, 500)

    this.ctrlWnd = new ControlWnd(this.wndMgr, this.nes, screenWnd, this.audioManager, (action) => {
      switch (action) {
      case 'step':
        this.dumpCpu()
        this.render()
        break
      case 'paused':
        this.dumpCpu()
        break
      case 'reset':
        this.traceWnd.reset()
        this.dumpCpu()
        break
      default:
        break
      }
    })
    this.wndMgr.add(this.ctrlWnd)
    this.ctrlWnd.setPos(520, 500)

    this.nes.cpu.pause(true)
    this.nes.reset()

    this.dumpCpu()

    this.padKeyHandler = new PadKeyHandler()
    this.setUpKeyEvent(root, this.padKeyHandler)

    // Handle file drop.
    if (window.File && window.FileReader && window.FileList && window.Blob) {
      handleFileDrop(root, (romData) => { this.loadRom(romData) })
    }

    this.startLoopAnimation()
  }

  private onVblank(leftCycles: number): void {
    if (leftCycles < 1)
      this.render()

    for (let i = 0; i < AudioManager.CHANNEL; ++i) {
      this.audioManager.setChannelFrequency(i, this.nes.apu.getFrequency(i))
      this.audioManager.setChannelVolume(i, this.nes.apu.getVolume(i))
    }
  }

  private onBreakPoint(): void {
    this.updateButtonState()
    this.dumpCpu()
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
    this.traceWnd.reset()
    this.dumpCpu()
    this.updateButtonState()
    this.root.focus()
    return true
  }

  private updateButtonState(): void {
    const paused = this.nes.cpu.isPaused()
    this.ctrlWnd.updateState(paused)
  }

  private dumpCpu(): void {
    this.registerWnd.updateStatus()
    this.traceWnd.updateStatus()
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
