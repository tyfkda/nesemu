import WindowManager from '../wnd/window_manager.ts'
import Wnd from '../wnd/wnd.ts'
import {Nes} from '../nes/nes.ts'

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
    canvas.style.width = '512px'
    canvas.style.height = '480px'
    canvas.className = 'pixelated'
    clearCanvas(canvas)

    super(wndMgr, 512, 480, 'NES', canvas)
    this.nes = nes
    this.canvas = canvas
    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
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

  public constructor(wndMgr: WindowManager, nes: Nes) {
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
