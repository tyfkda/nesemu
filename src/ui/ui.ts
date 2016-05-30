import Wnd from '../wnd/wnd.ts'
import {Nes} from '../nes/nes.ts'

function clearCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d')
  context.strokeStyle = ''
  context.fillStyle = `rgb(255,0,255)`
  context.fillRect(0, 0, canvas.width, canvas.height)
}

export class PaletWnd extends Wnd {
  private nes: Nes
  private canvas: HTMLCanvasElement

  public constructor(nes: Nes) {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 64
    canvas.height = 8
    canvas.style.width = '128px'
    canvas.style.height = '16px'
    canvas.className = 'pixelated'
    clearCanvas(canvas)

    super(128, 16, 'Palette', canvas)
    this.nes = nes
    this.canvas = canvas
  }

  public update(): void {
    this.nes.renderPalet(this.canvas)
  }
}

export class NameTableWnd extends Wnd {
  private nes: Nes
  private canvas: HTMLCanvasElement

  public constructor(nes: Nes) {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 512
    canvas.height = 240
    canvas.style.width = '512px'
    canvas.style.height = '240px'
    canvas.className = 'pixelated'
    clearCanvas(canvas)

    super(512, 240, 'NameTable', canvas)
    this.nes = nes
    this.canvas = canvas
  }

  public update(): void {
    this.nes.renderNameTable(this.canvas)
  }
}
