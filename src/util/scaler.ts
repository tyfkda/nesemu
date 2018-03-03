import {Nes} from '../nes/nes'
import Util from '../util/util'

const WIDTH = 256
const HEIGHT = 240

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas') as HTMLCanvasElement
  canvas.width = width
  canvas.height = height
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  Util.clearCanvas(canvas)
  return canvas
}

export abstract class Scaler {
  protected canvas: HTMLCanvasElement

  public getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  public abstract render(nes: Nes): void

  public reset(): void {
    Util.clearCanvas(this.canvas)
  }
}

export class IdentityScaler extends Scaler {
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  public constructor() {
    super()

    this.canvas = createCanvas(WIDTH, HEIGHT)
    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)

    this.canvas.className = 'pixelated'
  }

  public render(nes: Nes): void {
    nes.render(this.imageData.data)
    this.context.putImageData(this.imageData, 0, 0)
  }
}

export class ScanlineScaler extends Scaler {
  private context: CanvasRenderingContext2D
  private orgImageData: ImageData
  private imageData: ImageData

  public constructor() {
    super()

    this.canvas = createCanvas(WIDTH, HEIGHT * 2)
    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)

    this.orgImageData = new ImageData(WIDTH, HEIGHT)
    for (let i = 0, n = WIDTH * HEIGHT; i < n; ++i) {
      this.orgImageData[i * 4 + 0] = 0
      this.orgImageData[i * 4 + 1] = 0
      this.orgImageData[i * 4 + 2] = 0
      this.orgImageData[i * 4 + 3] = 255
    }
  }

  public render(nes: Nes): void {
    nes.render(this.orgImageData.data)

    // Copy per scanline
    const src = this.orgImageData.data
    const dst = this.imageData.data
    for (let y = 0; y < HEIGHT; ++y) {
      // Even line: original color
      let si = y * (WIDTH * 4)
      let di = si * 2
      for (let x = 0; x < WIDTH; ++x) {
        dst[di + 0] = src[si + 0]  // R
        dst[di + 1] = src[si + 1]  // G
        dst[di + 2] = src[si + 2]  // B
        dst[di + 3] = 255  // A
        si += 4
        di += 4
      }

      // Odd line: half color
      si = y * (WIDTH * 4)
      di = si * 2 + WIDTH * 4
      for (let x = 0; x < WIDTH; ++x) {
        dst[di + 0] = src[si + 0] >> 1  // R
        dst[di + 1] = src[si + 1] >> 1  // G
        dst[di + 2] = src[si + 2] >> 1  // B
        dst[di + 3] = 255  // A
        si += 4
        di += 4
      }
    }

    this.context.putImageData(this.imageData, 0, 0)
  }
}
