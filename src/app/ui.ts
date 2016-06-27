import WindowManager from '../wnd/window_manager.ts'
import Wnd from '../wnd/wnd.ts'

import {Nes} from '../nes/nes.ts'
import {Addressing, Instruction, OpType, kInstTable} from '../nes/inst.ts'
import {disassemble} from '../nes/disasm.ts'
import {Util} from '../nes/util.ts'

import {App} from './app.ts'
import {AppEvent} from './app_event.ts'

import * as IRx from 'rxjs/Rx'
declare const Rx: typeof IRx

const WIDTH = 256
const HEIGHT = 240

function clearCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')
  context.strokeStyle = ''
  context.fillStyle = `rgb(64,64,64)`
  context.fillRect(0, 0, canvas.width, canvas.height)
}

function takeScreenshot(wndMgr: WindowManager, screenWnd: ScreenWnd): Wnd {
  const img = document.createElement('img') as HTMLImageElement
  const title = String(Date.now())
  img.src = screenWnd.capture()
  img.className = 'pixelated'
  img.style.width = img.style.height = '100%'
  img.title = img.alt = title

  const imgWnd = new Wnd(wndMgr, WIDTH, HEIGHT, title)
  imgWnd.setContent(img)
  imgWnd.addResizeBox()
  wndMgr.add(imgWnd)
  return imgWnd
}

function tryFullscreen(element: HTMLElement, callback: Function): boolean {
  const kList = [
    { fullscreen: 'requestFullscreen', change: 'fullscreenchange' },
    { fullscreen: 'webkitRequestFullScreen', change: 'webkitfullscreenchange' },
    { fullscreen: 'mozRequestFullScreen', change: 'mozfullscreenchange' },
    { fullscreen: 'msRequestFullscreen', change: 'MSFullscreenChange' },
  ]
  for (let i = 0; i < kList.length; ++i) {
    if (element[kList[i].fullscreen]) {
      element[kList[i].fullscreen]()
      const changeEvent = kList[i].change
      const exitHandler = () => {
        const isFullscreen = (document.fullScreen || document.mozFullScreen ||
                              document.webkitIsFullScreen)
        if (callback)
          callback(isFullscreen)
        if (!isFullscreen) {  // End
          document.removeEventListener(changeEvent, exitHandler, false)
        }
      }
      document.addEventListener(changeEvent, exitHandler, false)
      return true
    }
  }
  return false
}

export class ScreenWnd extends Wnd {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData
  private subscription: IRx.Subscription

  public constructor(wndMgr: WindowManager, private app: App, private nes: Nes,
                     private stream: AppEvent.Stream)
  {
    super(wndMgr, WIDTH * 2, HEIGHT * 2, 'NES')
    this.addMenuBar([
      {
        label: 'File',
        submenu: [
          {
            label: 'Pause',
            click: () => {
              if (this.nes.cpu.paused)
                this.stream.triggerRun()
              else
                this.stream.triggerPause()
            },
          },
          {
            label: 'Reset',
            click: () => {
              this.stream.triggerReset()
              this.stream.triggerRun()
            },
          },
          {
            label: 'Screenshot',
            click: () => {
              takeScreenshot(this.wndMgr, this)
            },
          },
          {
            label: 'Quit',
            click: () => {
              this.close()
            },
          },
        ],
      },
      {
        label: 'View',
        submenu: [
          {
            label: '1x1',
            click: () => {
              this.setClientSize(WIDTH, HEIGHT)
            },
          },
          {
            label: '2x2',
            click: () => {
              this.setClientSize(WIDTH * 2, HEIGHT * 2)
            },
          },
          {
            label: 'Adjust aspect ratio',
            click: () => {
              const root = this.getRootNode()
              const width = parseInt(root.style.width, 10)
              const height = (width * (HEIGHT / WIDTH)) | 0
              this.setClientSize(width, height)
            },
          },
          {
            label: 'Max',
            click: () => {
              this.setClientSize(window.innerWidth - 2,
                                 window.innerHeight - Wnd.HEADER_HEIGHT - 2)  // -2 for border size
              this.setPos(0, 0)
            },
          },
          {
            label: 'Fullscreen',
            click: () => {
              this.setFullscreen()
            },
          },
        ],
      },
      {
        label: 'Debug',
        submenu: [
          {
            label: 'Palette',
            click: () => {
              this.app.createPaletWnd()
            },
          },
          {
            label: 'NameTable',
            click: () => {
              this.app.createNameTableWnd()
            },
          },
          {
            label: 'PatternTable',
            click: () => {
              this.app.createPatternTableWnd()
            },
          },
          {
            label: 'Trace',
            click: () => {
              this.app.createTraceWnd()
            },
          },
          {
            label: 'Registers',
            click: () => {
              this.app.createRegisterWnd()
            },
          },
          {
            label: 'Control',
            click: () => {
              this.app.createControlWnd()
            },
          },
          {
            label: 'FPS',
            click: () => {
              this.createFpsWnd()
            },
          },
        ],
      },
    ])

    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = WIDTH
    canvas.height = HEIGHT
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.className = 'pixelated'
    clearCanvas(canvas)

    this.setContent(canvas)
    this.canvas = canvas
    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    this.addResizeBox()

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.nes.render(this.imageData.data)
          this.context.putImageData(this.imageData, 0, 0)
          break
        case AppEvent.Type.SCREEN_SHOT:
          takeScreenshot(this.wndMgr, this)
          break
        case AppEvent.Type.RESET:
          clearCanvas(this.canvas)
          break
        }
      })
  }

  public capture(): string {
    return this.canvas.toDataURL()
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  public setFullscreen(callback?: Function): boolean {
    return tryFullscreen(this.contentHolder, (isFullscreen) => {
      const style = this.contentHolder.style
      if (isFullscreen) {
        let width = window.parent.screen.width
        let height = window.parent.screen.height
        if (width / height >= WIDTH / HEIGHT) {
          width = (height * (WIDTH / HEIGHT)) | 0
        } else {
          height = (width * (HEIGHT / WIDTH)) | 0
        }
        style.width = `${width}px`
        style.height = `${height}px`
        style.margin = 'auto'
        style.backgroundColor = 'black'
      } else {
        style.width = style.height = style.margin = style.backgroundColor = ''
      }
      if (callback)
        callback(isFullscreen)
    })
  }

  public close(): void {
    this.subscription.unsubscribe()
    this.stream.triggerDestroy()
    super.close()
  }

  public setFocus(): Wnd {
    this.canvas.focus()
    return this
  }

  private createFpsWnd(): void {
    const fpsWnd = new FpsWnd(this.wndMgr, this.stream)
    this.wndMgr.add(fpsWnd)
  }
}

export class PaletWnd extends Wnd {
  private static UNIT = 8
  private static W = 16
  private static H = 2

  private boxes: HTMLCanvasElement[]
  private palet: Uint8Array
  private tmp: Uint8Array
  private subscription: IRx.Subscription

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

  constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 128, 16, 'Palette')
    this.palet = new Uint8Array(PaletWnd.W * PaletWnd.H)
    this.tmp = new Uint8Array(PaletWnd.W * PaletWnd.H)

    const [content, boxes] = PaletWnd.createDom()
    this.setContent(content)
    this.boxes = boxes

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.close()
          break
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })
    this.render()
  }

  public close(): void {
    this.subscription.unsubscribe()
    super.close()
  }

  private render(): void {
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
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData
  private subscription: IRx.Subscription

  public constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 512, 240, 'NameTable')

    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 512
    canvas.height = 240
    canvas.style.width = '512px'
    canvas.style.height = '240px'
    canvas.className = 'pixelated'
    clearCanvas(canvas)

    this.setContent(canvas)
    this.canvas = canvas

    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.close()
          break
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })
    this.render()
  }

  public close(): void {
    this.subscription.unsubscribe()
    super.close()
  }

  private render(): void {
    this.nes.renderNameTable(this.imageData.data, this.imageData.width)
    this.context.putImageData(this.imageData, 0, 0)
  }
}

const kPatternColors = [
  0, 0, 0,
  255, 0, 0,
  0, 255, 0,
  0, 0, 255,
]

export class PatternTableWnd extends Wnd {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData
  private subscription: IRx.Subscription

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

  public constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 256, 128, 'PatternTable')

    const canvas = PatternTableWnd.createCanvas()
    this.setContent(canvas)
    this.canvas = canvas

    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.close()
          break
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })
    this.render()
  }

  public close(): void {
    this.subscription.unsubscribe()
    super.close()
  }

  private render(): void {
    this.nes.renderPatternTable(this.imageData.data, this.imageData.width, kPatternColors)
    this.context.putImageData(this.imageData, 0, 0)
  }
}

export class RegisterWnd extends Wnd {
  private valueElems: HTMLInputElement[]
  private subscription: IRx.Subscription

  public constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 100, 160, 'Regs')

    const content = this.createContent()
    this.setContent(content)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.close()
          break
        case AppEvent.Type.RESET:
        case AppEvent.Type.STEP:
        case AppEvent.Type.PAUSE:
        case AppEvent.Type.BREAK_POINT:
          this.updateStatus()
          break
        }
      })
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

  public close(): void {
    this.subscription.unsubscribe()
    super.close()
  }

  private createContent(): HTMLElement {
    const root = document.createElement('div')
    root.className = 'fixed-font'

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
    return root
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
  private textarea: HTMLTextAreaElement

  private mem: Uint8Array
  private bins: string[]
  private lines: string[]
  private subscription: IRx.Subscription

  public constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 400, 160, 'Trace')
    this.mem = new Uint8Array(MAX_BYTES)
    this.bins = new Array(MAX_BYTES)

    const content = this.createContent()
    this.setContent(content)
    this.reset()

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.close()
          break
        case AppEvent.Type.RESET:
          this.reset()
          // Fall through.
        case AppEvent.Type.STEP:
        case AppEvent.Type.PAUSE:
        case AppEvent.Type.BREAK_POINT:
          this.updateStatus()
          break
        }
      })
  }

  public reset(): void {
    this.lines = []
  }

  public updateStatus(): void {
    const cpu = this.nes.cpu
    const op = cpu.read8Raw(cpu.pc)
    const inst = kInstTable[op] || kIllegalInstruction

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

  public close(): void {
    this.subscription.unsubscribe()
    super.close()
  }

  private createContent(): HTMLElement {
    const root = document.createElement('div')
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
    return root
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
  private stepBtn: HTMLButtonElement
  private runBtn: HTMLButtonElement
  private pauseBtn: HTMLButtonElement
  private subscription: IRx.Subscription

  public constructor(wndMgr: WindowManager, private stream: AppEvent.Stream) {
    super(wndMgr, 256, 32, 'Control')

    const content = this.createElement()
    this.setContent(content)
    this.updateState(true)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.close()
          break
        case AppEvent.Type.RUN:
          this.updateState(false)
          break
        case AppEvent.Type.PAUSE:
        case AppEvent.Type.BREAK_POINT:
          this.updateState(true)
          break
        }
      })
  }

  public updateState(paused: boolean): void {
    this.stepBtn.disabled = !paused
    this.runBtn.disabled = !paused
    this.pauseBtn.disabled = paused
  }

  public close(): void {
    this.subscription.unsubscribe()
    super.close()
  }

  private createElement(): HTMLElement {
    const root = document.createElement('div')
    root.style.width = '256px'
    root.style.height = '32px'

    this.stepBtn = document.createElement('button') as HTMLButtonElement
    this.stepBtn.innerText = 'Step'
    this.stepBtn.addEventListener('click', () => {
      this.stream.triggerStep()
    })
    root.appendChild(this.stepBtn)

    this.runBtn = document.createElement('button') as HTMLButtonElement
    this.runBtn.innerText = 'Run'
    this.runBtn.addEventListener('click', () => {
      this.stream.triggerRun()
    })
    root.appendChild(this.runBtn)

    this.pauseBtn = document.createElement('button') as HTMLButtonElement
    this.pauseBtn.innerText = 'Pause'
    this.pauseBtn.addEventListener('click', () => {
      this.stream.triggerPause()
    })
    root.appendChild(this.pauseBtn)

    const resetBtn = document.createElement('button') as HTMLButtonElement
    resetBtn.innerText = 'Reset'
    resetBtn.addEventListener('click', () => {
      this.stream.triggerReset()
    })
    root.appendChild(resetBtn)

    const captureBtn = document.createElement('button') as HTMLButtonElement
    captureBtn.innerText = 'Capture'
    captureBtn.addEventListener('click', () => {
      this.stream.triggerScreenShot()
    })
    root.appendChild(captureBtn)

    return root
  }
}

export class FpsWnd extends Wnd {
  private subscription: IRx.Subscription
  private stats: Stats

  constructor(wndMgr: WindowManager, private stream: AppEvent.Stream) {
    super(wndMgr, 80, 48, 'Fps')

    const content = document.createElement('div')
    content.style.width = '80px'
    content.style.height = '48px'
    this.setContent(content)

    this.stats = new Stats()
    content.appendChild(this.stats.domElement)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.close()
          break
        case AppEvent.Type.START_CALC:
          this.stats.begin()
          break
        case AppEvent.Type.END_CALC:
          this.stats.end()
          break
        }
      })
  }

  public close(): void {
    this.subscription.unsubscribe()
    super.close()
  }
}
