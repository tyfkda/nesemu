import WindowManager from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'

import DomUtil from '../util/dom_util'
import {Nes} from '../nes/nes'
import {kColors} from '../nes/ppu/const'

import {AppEvent} from './app_event'

import * as Pubsub from '../util/pubsub'
import * as Stats from 'stats-js'

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
    super(wndMgr, PaletWnd.W * PaletWnd.UNIT, PaletWnd.H * PaletWnd.UNIT, 'Palette')

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

    const n = PaletWnd.W * PaletWnd.H
    for (let i = 0; i < n; ++i) {
      const c = tmp[i]
      if (c === this.palet[i])
        continue
      this.palet[i] = c

      const j = c * 3
      const r = kColors[j + 0]
      const g = kColors[j + 1]
      const b = kColors[j + 2]
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
                     private getSelectedPalets: (buf: Uint8Array) => boolean) {
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

export class GlobalPaletWnd extends Wnd {
  private static UNIT = 12
  private static W = 16
  private static H = 4

  private boxes: HTMLElement[]

  constructor(wndMgr: WindowManager, private onClose?: () => void) {
    super(wndMgr,
          GlobalPaletWnd.W * GlobalPaletWnd.UNIT, GlobalPaletWnd.H * GlobalPaletWnd.UNIT,
          'Global palette')

    const {root, boxes} = this.createDom()
    this.setContent(root)
    this.boxes = boxes

    // Set colors
    const n = this.boxes.length
    for (let i = 0; i < n; ++i) {
      const r = kColors[i * 3 + 0]
      const g = kColors[i * 3 + 1]
      const b = kColors[i * 3 + 2]
      this.boxes[i].style.backgroundColor = `rgb(${r},${g},${b})`
    }
  }

  public close(): void {
    if (this.onClose != null)
      this.onClose()
    super.close()
  }

  private createDom(): {root: HTMLElement, boxes: HTMLElement[]} {
    const UNIT = GlobalPaletWnd.UNIT, W = GlobalPaletWnd.W, H = GlobalPaletWnd.H
    const root = document.createElement('div')
    root.className = 'clearfix'
    DomUtil.setStyles(root, {
      width: `${UNIT * W}px`,
      height: `${UNIT * H}px`,
    })

    const boxes = new Array<HTMLElement>(W * H)
    for (let i = 0; i < H; ++i) {
      const line = document.createElement('div')
      line.className = 'pull-left clearfix'
      DomUtil.setStyles(line, {
        width: `${UNIT * W}px`,
        height: `${UNIT}px`,
        backgroundColor: 'black',
      })
      root.appendChild(line)

      for (let j = 0; j < W; ++j) {
        const box = document.createElement('div')
        box.className = 'pull-left'
        DomUtil.setStyles(box, {
          width: `${UNIT - 1}px`,
          height: `${UNIT - 1}px`,
          marginRight: '1px',
        })
        boxes[j + i * W] = box
        line.appendChild(box)
      }
    }
    return {root, boxes}
  }
}
