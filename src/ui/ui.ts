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

  public constructor(nes: Nes) {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = 256
    canvas.height = 240
    canvas.style.width = '512px'
    canvas.style.height = '480px'
    canvas.className = 'pixelated'
    clearCanvas(canvas)

    super(512, 480, 'NES', canvas)
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
