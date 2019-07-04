import WindowManager from '../wnd/window_manager'
import Wnd from '../wnd/wnd'

import DomUtil from '../util/dom_util'
import {Nes} from '../nes/nes'
import {Addressing, Instruction, OpType, kInstTable} from '../nes/cpu/inst'
import {disassemble} from '../nes/cpu/disasm'
import {Scaler, NearestNeighborScaler, ScanlineScaler, EpxScaler} from '../util/scaler'
import Util from '../util/util'

import {App} from './app'
import {AppEvent} from './app_event'

import * as Pubsub from '../util/pubsub'
import * as Stats from 'stats-js'

const WIDTH = 256 | 0
const HEIGHT = 240 | 0
const HEDGE = 0 | 0
const VEDGE = 8 | 0

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

function fitAspectRatio(width: number, height: number, ratio: number): [number, number] {
  if (width / height >= ratio)
    width = height * ratio
  else
    height = width / ratio
  return [width, height]
}

export class FpsWnd extends Wnd {
  private subscription: Pubsub.Subscription
  private stats: Stats

  constructor(wndMgr: WindowManager, private stream: AppEvent.Stream) {
    super(wndMgr, 80, 48, 'Fps')

    const content = document.createElement('div')
    DomUtil.setStyles(content, {
      width: '80px',
      height: '48px',
    })
    this.setContent(content)

    this.stats = new Stats()
    this.stats.domElement.style.position = ''
    content.appendChild(this.stats.domElement)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
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
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }
}

export class ScreenWnd extends Wnd {
  protected subscription: Pubsub.Subscription
  private fullscreenBase: HTMLElement
  private canvasHolder: HTMLElement
  private scaler: Scaler
  private hideEdge = true
  private contentWidth = 0  // Content size, except fullscreen
  private contentHeight = 0

  constructor(wndMgr: WindowManager, protected app: App, protected nes: Nes,
              protected stream: AppEvent.Stream)
  {
    super(wndMgr, (WIDTH - HEDGE * 2) * 2, (HEIGHT - VEDGE * 2) * 2 + Wnd.MENUBAR_HEIGHT, 'NES')
    if (app == null || nes == null || stream == null)
      return

    this.setUpMenuBar()
    this.contentHolder.style.overflow = 'hidden'

    this.fullscreenBase = document.createElement('div')
    this.fullscreenBase.className = 'full-size'
    DomUtil.setStyles(this.fullscreenBase, {
      position: 'relative',
      overflow: 'hidden',
    })
    this.setContent(this.fullscreenBase)

    this.canvasHolder = document.createElement('div')
    DomUtil.setStyles(this.canvasHolder, {
      transitionDuration: '0.1s',
      transitionProperty: 'width, height',
    })
    this.fullscreenBase.appendChild(this.canvasHolder)

    this.setScaler(new NearestNeighborScaler())
    this.addResizeBox()

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        case AppEvent.Type.RESET:
          this.scaler.reset()
          break
        }
      })

    this.contentWidth = (WIDTH - HEDGE * 2) * 2
    this.contentHeight = (HEIGHT - VEDGE * 2) * 2
    this.updateContentSize(this.contentWidth, this.contentHeight)
  }

  protected onEvent(action: string, param?: any): any {
    switch (action) {
    case 'resize':
      {
        const {width, height} = param
        this.onResized(width, height)
      }
      break
    case 'openMenu':
      this.stream.triggerOpenMenu()
      break
    case 'closeMenu':
      this.stream.triggerCloseMenu()
      break
    }
  }


  public onResized(width: number, height: number): void {
    this.contentWidth = width
    this.contentHeight = height
    this.updateContentSize(width, height - Wnd.MENUBAR_HEIGHT)
  }

  public setClientSize(width: number, height: number): Wnd {
    super.setClientSize(width, height)
    this.contentWidth = width
    this.contentHeight = height
    this.updateContentSize(width, height)
    return this
  }

  public capture(): string {
    return this.scaler.getCanvas().toDataURL()
  }

  public setFullscreen(callback?: (isFullscreen: boolean) => boolean): boolean {
    return this.wndMgr.setFullscreen(this.contentHolder, (isFullscreen) => {
      if (isFullscreen) {
        let width = window.parent.screen.width
        let height = window.parent.screen.height
        if (width / height >= WIDTH / HEIGHT) {
          width = (height * (WIDTH / HEIGHT)) | 0
        } else {
          height = (width * (HEIGHT / WIDTH)) | 0
        }
        DomUtil.setStyles(this.fullscreenBase, {
          width: `${width}px`,
          height: `${height}px`,
          margin: 'auto',
        })
        this.contentHolder.style.backgroundColor = 'black'
        this.updateContentSize(width, height)
      } else {
        DomUtil.setStyles(this.fullscreenBase, {
          width: '',
          height: '',
          margin: '',
        })
        this.contentHolder.style.backgroundColor = ''
        this.updateContentSize(this.contentWidth, this.contentHeight)
      }
      if (callback)
        callback(isFullscreen)
      this.contentHolder.focus()
    })
  }

  public close(): void {
    if (this.subscription != null)
      this.subscription.unsubscribe()
    this.stream.triggerCloseWnd(this)
    super.close()
  }

  public render(): void {
    this.scaler.render(this.nes)
  }

  protected setClientScale(scale: number): Wnd {
    const w = ((WIDTH - (this.hideEdge ? HEDGE * 2 : 0)) * scale) | 0
    const h = ((HEIGHT - (this.hideEdge ? VEDGE * 2 : 0)) * scale) | 0
    return this.setClientSize(w, h)
  }

  protected updateContentSize(width: number, height: number) {
    if (!this.fullscreenBase)
      return

    const w = !this.hideEdge ? width : (width * (WIDTH / (WIDTH - HEDGE * 2))) | 0
    const h = !this.hideEdge ? height : (height * (HEIGHT / (HEIGHT - VEDGE * 2))) | 0
    const left = !this.hideEdge ? 0 : -(w * HEDGE / WIDTH) | 0
    const top = !this.hideEdge ? 0 : -(h * VEDGE / HEIGHT) | 0
    DomUtil.setStyles(this.canvasHolder, {
      position: 'absolute',
      width: `${w}px`,
      height: `${h}px`,
      top: `${top}px`,
      left: `${left}px`,
    })
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
              this.setClientScale(1)
            },
          },
          {
            label: '2x2',
            click: () => {
              this.setClientScale(2)
            },
          },
          {
            label: 'Adjust aspect ratio',
            click: () => {
              this.adjustAspectRatio()
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
            label: 'Nearest',
            click: () => {
              this.setScaler(new NearestNeighborScaler())
            },
          },
          {
            label: 'Scanline',
            click: () => {
              this.setScaler(new ScanlineScaler())
            },
          },
          {
            label: 'Epx',
            click: () => {
              this.setScaler(new EpxScaler())
            },
          },
        ],
      },
      {
        label: 'Debug',
        submenu: [
          {
            label: 'Edge',
            click: () => {
              this.toggleEdge()
            },
          },
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

  protected maximize() {
    const winWidth = window.innerWidth
    const winHeight = window.innerHeight
    const maxWidth = winWidth - 2  // -2 for border size
    const maxHeight = winHeight - Wnd.TITLEBAR_HEIGHT - Wnd.MENUBAR_HEIGHT - 2

    const w = WIDTH - (this.hideEdge ? HEDGE * 2 : 0)
    const h = HEIGHT - (this.hideEdge ? VEDGE * 2 : 0)
    const [width, height] = fitAspectRatio(maxWidth, maxHeight, w / h)

    this.setPos((winWidth - (width + 2)) / 2, (winHeight - (height + Wnd.TITLEBAR_HEIGHT + Wnd.MENUBAR_HEIGHT + 2)) / 2)
    this.setClientSize(width, height)
  }

  private adjustAspectRatio() {
    const rect = this.contentHolder.getBoundingClientRect()
    const w = WIDTH - (this.hideEdge ? HEDGE * 2 : 0)
    const h = HEIGHT - (this.hideEdge ? VEDGE * 2 : 0)
    const [width, height] = fitAspectRatio(rect.width, rect.height, w / h)
    this.setClientSize(width, height)
  }

  private toggleEdge() {
    this.hideEdge = !this.hideEdge
    this.updateContentSize(this.contentHolder.offsetWidth, this.contentHolder.offsetHeight)
  }

  private setScaler(scaler: Scaler): void {
    const initial = this.scaler == null
    this.scaler = scaler
    DomUtil.removeAllChildren(this.canvasHolder)
    this.canvasHolder.appendChild(scaler.getCanvas())

    if (!initial)
      this.render()
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
  private groups: HTMLElement[]
  private palet = new Uint8Array(PaletWnd.W * PaletWnd.H)
  private tmp = new Uint8Array(PaletWnd.W * PaletWnd.H)
  private subscription: Pubsub.Subscription
  private selected = new Uint8Array(PaletWnd.H)

  constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 128, 16, 'Palette')

    const {root, boxes, groups} = this.createDom()
    this.setContent(root)
    this.boxes = boxes
    this.groups = groups
    this.selected.fill(0)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })

    this.palet.fill(-1)
    this.render()
  }

  public getSelectedPalets(buf: Uint8Array) {
    const selected = this.selected
    for (let i = 0; i < selected.length; ++i)
      buf[i] = selected[i]
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private render(): void {
    const tmp = this.tmp
    this.getPalet(tmp)

    const colorTable = this.nes.getPaletColorTable()
    const n = PaletWnd.W * PaletWnd.H
    for (let i = 0; i < n; ++i) {
      const c = tmp[i]
      if (c === this.palet[i])
        continue
      this.palet[i] = c

      const j = c * 3
      const r = colorTable[j + 0]
      const g = colorTable[j + 1]
      const b = colorTable[j + 2]
      this.boxes[i].style.backgroundColor = `rgb(${r},${g},${b})`
    }
  }

  private getPalet(buf: Uint8Array): void {
    const ppu = this.nes.getPpu()
    const n = PaletWnd.W * PaletWnd.H
    for (let i = 0; i < n; ++i)
      buf[i] = ppu.getPalet(i)
  }

  private createDom(): {root: HTMLElement, boxes: HTMLElement[], groups: HTMLElement[]} {
    const UNIT = PaletWnd.UNIT, W = PaletWnd.W, H = PaletWnd.H
    const root = document.createElement('div')
    root.className = 'clearfix'
    DomUtil.setStyles(root, {
      width: `${UNIT * W}px`,
      height: `${UNIT * H}px`,
    })

    const boxes = new Array<HTMLElement>(W * H)
    const groups = new Array<HTMLElement>((W / 4) * H)
    for (let i = 0; i < H; ++i) {
      const line = document.createElement('div')
      line.className = 'pull-left clearfix'
      DomUtil.setStyles(line, {
        width: `${UNIT * W}px`,
        height: `${UNIT}px`,
        backgroundColor: 'black',
      })
      root.appendChild(line)

      for (let j = 0; j < W / 4; ++j) {
        const group = document.createElement('div')
        group.className = 'pull-left clearfix'
        DomUtil.setStyles(group, {
          width: `${UNIT * 4}px`,
          height: `${UNIT}px`,
          cursor: 'pointer',
        })
        groups[j + i * (W / 4)] = group
        line.appendChild(group)
        group.addEventListener('click', (_event) => {
          this.select(i, j)
        })

        for (let k = 0; k < 4; ++k) {
          const box = document.createElement('div')
          box.className = 'pull-left'
          DomUtil.setStyles(box, {
            width: `${UNIT - 1}px`,
            height: `${UNIT - 1}px`,
            marginRight: '1px',
          })
          boxes[(j * 4 + k) + i * W] = box
          group.appendChild(box)
        }
      }
    }
    return {root, boxes, groups}
  }

  private select(i: number, j: number): void {
    this.groups[i * (PaletWnd.W / 4) + this.selected[i]].style.backgroundColor = ''
    this.groups[i * (PaletWnd.W / 4) + j].style.backgroundColor = 'red'
    this.selected[i] = j
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
    DomUtil.setStyles(canvas, {
      width: `${width}px`,
      height: `${height}px`,
    })
    canvas.className = 'pixelated'
    DomUtil.clearCanvas(canvas)

    this.setContent(canvas)
    this.canvas = canvas

    this.context = DomUtil.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })
    this.render()
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
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

export class PatternTableWnd extends Wnd {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData
  private subscription: Pubsub.Subscription
  private buf = new Uint8Array(2)

  private static createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 256
    canvas.height = 128
    DomUtil.setStyles(canvas, {
      width: '256px',
      height: '128px',
    })
    canvas.className = 'pixelated'
    DomUtil.clearCanvas(canvas)
    return canvas
  }

  public constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream,
                     private getSelectedPalets: (buf: Uint8Array) => void) {
    super(wndMgr, 256, 128, 'PatternTable')

    const canvas = PatternTableWnd.createCanvas()
    this.setContent(canvas)
    this.canvas = canvas

    this.context = DomUtil.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })
    this.render()
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private render(): void {
    const buf = this.buf
    this.getSelectedPalets(buf)

    this.nes.renderPatternTable(this.imageData.data, this.imageData.width, buf)
    this.context.putImageData(this.imageData, 0, 0)
  }
}

export class RegisterWnd extends Wnd {
  protected valueElems = new Array<HTMLInputElement>()
  protected subscription: Pubsub.Subscription

  private static createPregStr(p): string {
    const chrs = 'NV_BDIZC'
    const ss = new Array<string>(8)
    for (let i = 0; i < 8; ++i)
      ss[i] = ((p & (0x80 >> i)) !== 0) ? chrs[i] : '.'
    return ss.join('')
  }

  public constructor(wndMgr: WindowManager, protected nes: Nes, protected stream: AppEvent.Stream) {
    super(wndMgr, 100, 160, 'Regs')

    const content = this.createContent()
    this.setContent(content)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
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
    this.valueElems[5].value = RegisterWnd.createPregStr(regs.p)
    this.valueElems[6].value = String(this.nes.getCycleCount())
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
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
    DomUtil.setStyles(table, {
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

  private mem = new Uint8Array(MAX_BYTES)
  private bins = new Array<string>(MAX_BYTES)
  private lines = new Array<string>()
  private subscription: Pubsub.Subscription

  public constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 400, 160, 'Trace')

    const content = this.createContent()
    this.setContent(content)
    this.reset()

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
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
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private createContent(): HTMLElement {
    const root = document.createElement('div')
    const textarea = document.createElement('textarea')
    textarea.className = 'fixed-font'
    DomUtil.setStyles(textarea, {
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
    super(wndMgr, 192, 32, 'Control')

    const content = this.createElement()
    this.setContent(content)
    this.updateState(true)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
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
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private createElement(): HTMLElement {
    const root = document.createElement('div')
    DomUtil.setStyles(root, {
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

    return root
  }
}
