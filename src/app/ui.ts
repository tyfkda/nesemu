import WindowManager from '../wnd/window_manager.ts'
import Wnd from '../wnd/wnd.ts'

import {Nes} from '../nes/nes.ts'
import {Cpu6502} from '../nes/cpu.ts'
import {Addressing, Instruction, OpType} from '../nes/inst.ts'
import {disassemble} from '../nes/disasm.ts'
import {Util} from '../nes/util.ts'

import {AudioManager} from './audio_manager.ts'

function clearCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')
  context.strokeStyle = ''
  context.fillStyle = `rgb(64,64,64)`
  context.fillRect(0, 0, canvas.width, canvas.height)
}

export class ScreenWnd extends Wnd {
  private nes: Nes
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  public constructor(wndMgr: WindowManager, nes: Nes) {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 256
    canvas.height = 240
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.className = 'pixelated'
    clearCanvas(canvas)

    super(wndMgr, 512, 480, 'NES', canvas)
    this.nes = nes
    this.canvas = canvas
    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    this.addResizeBox()
  }

  public update(): void {
    this.nes.render(this.context, this.imageData)
  }

  public capture(): string {
    return this.canvas.toDataURL()
  }
}

export class PaletWnd extends Wnd {
  private static UNIT = 8
  private static W = 16
  private static H = 2

  private nes: Nes
  private boxes: HTMLCanvasElement[]
  private palet: Uint8Array
  private tmp: Uint8Array

  private static createDom(): any {
    const UNIT = PaletWnd.UNIT, W = PaletWnd.W, H = PaletWnd.H
    const root = document.createElement('div')
    root.className = 'clearfix'
    root.style.width = `${UNIT * W}px`
    root.style.height = `${UNIT * H}px`

    const boxes = new Array(W * H) as HTMLElement[]
    for (let i = 0; i < H; ++i) {
      for (let j = 0; j < W; ++j) {
        const box = document.createElement('div')
        box.className = 'pull-left'
        box.style.width = `${UNIT - 1}px`
        box.style.height = `${UNIT - 1}px`
        box.style.borderRight = box.style.borderBottom = '1px solid black'
        boxes[j + i * W] = box
        root.appendChild(box)
      }
    }
    return [root, boxes]
  }

  private static getPalet(nes: Nes, buf: Uint8Array): void {
    const n = PaletWnd.W * PaletWnd.H
    for (let i = 0; i < n; ++i)
      buf[i] = nes.getPalet(i)
  }

  constructor(wndMgr: WindowManager, nes: Nes) {
    const [content, boxes] = PaletWnd.createDom()

    super(wndMgr, 128, 16, 'Palette', content)
    this.nes = nes
    this.boxes = boxes
    this.palet = new Uint8Array(PaletWnd.W * PaletWnd.H)
    this.tmp = new Uint8Array(PaletWnd.W * PaletWnd.H)
  }

  public update(): void {
    const tmp = this.tmp
    PaletWnd.getPalet(this.nes, tmp)

    const n = PaletWnd.W * PaletWnd.H
    for (let i = 0; i < n; ++i) {
      const c = tmp[i]
      if (c === this.palet[i])
        continue
      this.palet[i] = c
      this.boxes[i].style.backgroundColor = Nes.getPaletColorString(c)
    }
  }
}

export class NameTableWnd extends Wnd {
  private nes: Nes
  private canvas: HTMLCanvasElement

  public constructor(wndMgr: WindowManager, nes: Nes) {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 512
    canvas.height = 240
    canvas.style.width = '512px'
    canvas.style.height = '240px'
    canvas.className = 'pixelated'
    clearCanvas(canvas)

    super(wndMgr, 512, 240, 'NameTable', canvas)
    this.nes = nes
    this.canvas = canvas
  }

  public update(): void {
    this.nes.renderNameTable(this.canvas)
  }
}

const kPatternColors = [
  0, 0, 0,
  255, 0, 0,
  0, 255, 0,
  0, 0, 255,
]

export class PatternTableWnd extends Wnd {
  private nes: Nes
  private canvas: HTMLCanvasElement

  private static createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 256
    canvas.height = 128
    canvas.style.width = '256px'
    canvas.style.height = '128px'
    canvas.className = 'pixelated'
    clearCanvas(canvas)
    return canvas
  }

  public constructor(wndMgr: WindowManager, nes: Nes) {
    const canvas = PatternTableWnd.createCanvas()

    super(wndMgr, 256, 128, 'PatternTable', canvas)
    this.nes = nes
    this.canvas = canvas
  }

  public update(): void {
    this.nes.renderPatternTable(this.canvas, kPatternColors)
  }
}

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

const kIllegalInstruction: Instruction = {
  opType: OpType.UNKNOWN,
  addressing: Addressing.UNKNOWN,
  bytes: 1,
  cycle: 0,
}

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

export class ControlWnd extends Wnd {
  private nes: Nes
  private screenWnd: ScreenWnd
  private audioManager: AudioManager
  private stepBtn: HTMLButtonElement
  private runBtn: HTMLButtonElement
  private pauseBtn: HTMLButtonElement

  public constructor(wndMgr: WindowManager, nes: Nes, screenWnd: ScreenWnd,
                     audioManager: AudioManager)
  {
    const root = document.createElement('div')

    super(wndMgr, 384, 32, 'Control', root)
    this.nes = nes
    this.screenWnd = screenWnd
    this.audioManager = audioManager

    this.createElement(root)
    this.updateState(true)
  }

  public updateState(paused: boolean): void {
    this.stepBtn.disabled = !paused
    this.runBtn.disabled = !paused
    this.pauseBtn.disabled = paused
  }

  private createElement(root: HTMLElement): void {
    root.style.width = '384px'
    root.style.height = '32px'

    this.stepBtn = document.createElement('button') as HTMLButtonElement
    this.stepBtn.innerText = 'Step'
    this.stepBtn.addEventListener('click', () => {
      this.nes.step()
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
    muteBtn.addEventListener('click', () => {
      const volume = muteBtn.checked ? 0.0 : 1.0
      this.audioManager.setMasterVolume(volume)
    })
    muteLabel.appendChild(muteBtn)
    muteLabel.appendChild(document.createTextNode('mute'))
    root.appendChild(muteLabel)
  }
}
