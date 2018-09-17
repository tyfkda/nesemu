import WindowManager from '../wnd/window_manager'
import Wnd from '../wnd/wnd'

import {Nes} from '../nes/nes'
import {Addressing, Instruction, OpType, kInstTable} from '../nes/inst'
import {disassemble} from '../nes/disasm'
import {Scaler, IdentityScaler, ScanlineScaler} from '../util/scaler'
import Util from '../util/util'

import {App} from './app'
import {AppEvent} from './app_event'

import * as Pubsub from '../util/pubsub'
import * as Stats from 'stats-js'

const WIDTH = 256
const HEIGHT = 240

function takeScreenshot(wndMgr: WindowManager, screenWnd: ScreenWnd): Wnd {
  const img = document.createElement('img') as HTMLImageElement
  const title = String(Date.now())
  img.src = screenWnd.capture()
  img.className = 'pixelated full-size'
  img.title = img.alt = title

  const imgWnd = new Wnd(wndMgr, WIDTH, HEIGHT, title)
  imgWnd.setContent(img)
  imgWnd.addResizeBox()
  wndMgr.add(imgWnd)
  return imgWnd
}

function tryFullscreen(element: HTMLElement, callback: (isFullscreen: boolean) => void): boolean {
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
        const isFullscreen = !!(document.fullScreen || document.mozFullScreen ||
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

export class FpsWnd extends Wnd {
  private subscription: Pubsub.Subscription
  private stats: Stats

  constructor(wndMgr: WindowManager, private stream: AppEvent.Stream) {
    super(wndMgr, 80, 48, 'Fps')

    const content = document.createElement('div')
    Util.setStyles(content, {
      width: '80px',
      height: '48px',
    })
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

export class ScreenWnd extends Wnd {
  protected subscription: Pubsub.Subscription
  private fullscreenBase: HTMLElement
  private scaler: Scaler

  constructor(wndMgr: WindowManager, protected app: App, protected nes: Nes,
              protected stream: AppEvent.Stream)
  {
    super(wndMgr, WIDTH * 2, HEIGHT * 2 + Wnd.MENUBAR_HEIGHT, 'NES')
    if (app == null || nes == null || stream == null)
      return

    this.setUpMenuBar()

    this.fullscreenBase = document.createElement('div')
    this.fullscreenBase.className = 'full-size'
    this.setContent(this.fullscreenBase)

    this.setScaler(new IdentityScaler())
    this.addResizeBox()

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.scaler.render(this.nes)
          break
        case AppEvent.Type.SCREEN_SHOT:
          takeScreenshot(this.wndMgr, this)
          break
        case AppEvent.Type.RESET:
          this.scaler.reset()
          break
        }
      })
  }

  public capture(): string {
    return this.scaler.getCanvas().toDataURL()
  }

  public setFullscreen(callback?: (isFullscreen: boolean) => boolean): boolean {
    return tryFullscreen(this.contentHolder, (isFullscreen) => {
      if (isFullscreen) {
        let width = window.parent.screen.width
        let height = window.parent.screen.height
        if (width / height >= WIDTH / HEIGHT) {
          width = (height * (WIDTH / HEIGHT)) | 0
        } else {
          height = (width * (HEIGHT / WIDTH)) | 0
        }
        Util.setStyles(this.fullscreenBase, {
          width: `${width}px`,
          height: `${height}px`,
          margin: 'auto',
        })
        this.contentHolder.style.backgroundColor = 'black'
      } else {
        Util.setStyles(this.fullscreenBase, {
          width: '',
          height: '',
          margin: '',
        })
        this.contentHolder.style.backgroundColor = ''
      }
      if (callback)
        callback(isFullscreen)
      this.contentHolder.focus()
    })
  }

  public close(): void {
    if (this.subscription != null)
      this.subscription.unsubscribe()
    this.stream.triggerDestroy()
    super.close()
  }

  protected setUpMenuBar(): void {
    this.addMenuBar([
      {
        label: 'File',
        submenu: [
          {
            label: 'Pause',
            click: () => {
              if (this.nes.getCpu().isPaused())
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
            label: 'Save',
            click: () => {
              this.app.saveData()
            },
          },
          {
            label: 'Load',
            click: () => {
              this.app.loadData()
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
              const rect = this.scaler.getCanvas().getBoundingClientRect()
              let width = rect.width, height = rect.height
              if (width / height >= WIDTH / HEIGHT)
                width = height / HEIGHT * WIDTH
              else
                height = width / WIDTH * HEIGHT
              this.setClientSize(width, height)
            },
          },
          {
            label: 'Max',
            click: () => {
              this.setPos(0, 0)
              const width = window.innerWidth - 2  // -2 for border size
              const height = window.innerHeight - Wnd.TITLEBAR_HEIGHT - Wnd.MENUBAR_HEIGHT - 2
              this.setClientSize(width, height)
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
        label: 'Scaler',
        submenu: [
          {
            label: 'Normal',
            click: () => {
              this.setScaler(new IdentityScaler())
            },
          },
          {
            label: 'Scanline',
            click: () => {
              this.setScaler(new ScanlineScaler())
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
  }

  private setScaler(scaler: Scaler): void {
    this.scaler = scaler
    Util.removeAllChildren(this.fullscreenBase)
    this.fullscreenBase.appendChild(scaler.getCanvas())
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

  private boxes: HTMLElement[]
  private palet = new Uint8Array(PaletWnd.W * PaletWnd.H)
  private tmp = new Uint8Array(PaletWnd.W * PaletWnd.H)
  private subscription: Pubsub.Subscription

  private static createDom(): {root: HTMLElement, boxes: HTMLElement[]} {
    const UNIT = PaletWnd.UNIT, W = PaletWnd.W, H = PaletWnd.H
    const root = document.createElement('div')
    root.className = 'clearfix'
    Util.setStyles(root, {
      width: `${UNIT * W}px`,
      height: `${UNIT * H}px`,
    })

    const boxes = new Array(W * H) as HTMLElement[]
    for (let i = 0; i < H; ++i) {
      for (let j = 0; j < W; ++j) {
        const box = document.createElement('div')
        box.className = 'pull-left'
        Util.setStyles(box, {
          width: `${UNIT - 1}px`,
          height: `${UNIT - 1}px`,
          borderRight: '1px solid black',
          borderBottom: '1px solid black',
        })
        boxes[j + i * W] = box
        root.appendChild(box)
      }
    }
    return {root, boxes}
  }

  private static getPalet(nes: Nes, buf: Uint8Array): void {
    const ppu = nes.getPpu()
    const n = PaletWnd.W * PaletWnd.H
    for (let i = 0; i < n; ++i)
      buf[i] = ppu.getPalet(i)
  }

  constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 128, 16, 'Palette')

    const {root, boxes} = PaletWnd.createDom()
    this.setContent(root)
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
  private nes: Nes
  private stream: AppEvent.Stream
  private vert: boolean
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData
  private subscription: Pubsub.Subscription

  public constructor(wndMgr: WindowManager, nes: Nes, stream: AppEvent.Stream,
                     vert: boolean) {
    const width = 256 * (vert ? 1 : 2)
    const height = 240 * (vert ? 2 : 1)
    super(wndMgr, width, height, 'NameTable')
    this.nes = nes
    this.stream = stream
    this.vert = vert

    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = width
    canvas.height = height
    Util.setStyles(canvas, {
      width: `${width}px`,
      height: `${height}px`,
    })
    canvas.className = 'pixelated'
    Util.clearCanvas(canvas)

    this.setContent(canvas)
    this.canvas = canvas

    this.context = Util.getCanvasContext2d(this.canvas)
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
    const page1X = this.vert ? 0 : 256
    const page1Y = this.vert ? 240 : 0
    this.nes.renderNameTable1(this.imageData.data, this.imageData.width, 0, 0, 0)
    this.nes.renderNameTable1(this.imageData.data, this.imageData.width, page1X, page1Y, 1)
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
  private subscription: Pubsub.Subscription

  private static createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 256
    canvas.height = 128
    Util.setStyles(canvas, {
      width: '256px',
      height: '128px',
    })
    canvas.className = 'pixelated'
    Util.clearCanvas(canvas)
    return canvas
  }

  public constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 256, 128, 'PatternTable')

    const canvas = PatternTableWnd.createCanvas()
    this.setContent(canvas)
    this.canvas = canvas

    this.context = Util.getCanvasContext2d(this.canvas)
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
  protected valueElems: HTMLInputElement[]
  protected subscription: Pubsub.Subscription

  public constructor(wndMgr: WindowManager, protected nes: Nes, protected stream: AppEvent.Stream) {
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
    const cpu = this.nes.getCpu()
    const regs = cpu.getRegs()
    this.valueElems[0].value = Util.hex(regs.pc, 4)
    this.valueElems[1].value = Util.hex(regs.a, 2)
    this.valueElems[2].value = Util.hex(regs.x, 2)
    this.valueElems[3].value = Util.hex(regs.y, 2)
    this.valueElems[4].value = Util.hex(regs.s, 2)
    this.valueElems[5].value = Util.hex(regs.p, 2)
    this.valueElems[6].value = String(this.nes.getCycleCount())
  }

  public close(): void {
    this.subscription.unsubscribe()
    super.close()
  }

  protected createContent(): HTMLElement {
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
    Util.setStyles(table, {
      fontSize: '10px',
      width: '100%',
    })
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
  private subscription: Pubsub.Subscription

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
    const cpu = this.nes.getCpu()
    const bus = this.nes.getBus()
    const pc = cpu.getRegs().pc
    const op = bus.read8(pc)
    const inst = kInstTable[op] || kIllegalInstruction

    for (let i = 0; i < inst.bytes; ++i) {
      const m = bus.read8(pc + i)
      this.mem[i] = m
      this.bins[i] = Util.hex(m, 2)
    }
    for (let i = inst.bytes; i < MAX_BYTES; ++i)
      this.bins[i] = '  '

    const pcStr = Util.hex(pc, 4)
    const binStr = this.bins.join(' ')
    const asmStr = disassemble(inst, this.mem, 1, pc)
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
    Util.setStyles(textarea, {
      fontSize: '14px',
      width: '100%',
      height: '160px',
      resize: 'none',
      margin: '0',
      padding: '2px',
      border: 'none',
      boxSizing: 'border-box',
    })
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
  private subscription: Pubsub.Subscription

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
    Util.setStyles(root, {
      width: '256px',
      height: '32px',
    })

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
