import DomUtil from '../util/dom_util'
import Nes from '../nes/nes'

const WIDTH = 256
const HEIGHT = 240

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.className = 'full-size'
  canvas.width = width
  canvas.height = height
  DomUtil.setStyles(canvas, {
    display: 'block',
  })
  DomUtil.clearCanvas(canvas)
  return canvas
}

function clearCanvasImage(imageData: ImageData) {
  for (let i = 0, n = imageData.width * imageData.height * 4; i < n; ++i) {
    imageData.data[i * 4 + 0] = 0
    imageData.data[i * 4 + 1] = 0
    imageData.data[i * 4 + 2] = 0
    imageData.data[i * 4 + 3] = 255
  }
}

export abstract class Scaler {
  protected canvas: HTMLCanvasElement

  public getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  public abstract render(nes: Nes): void

  public reset(): void {
    DomUtil.clearCanvas(this.canvas)
  }
}

export class NearestNeighborScaler extends Scaler {
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  public constructor() {
    super()

    this.canvas = createCanvas(WIDTH, HEIGHT)
    this.context = DomUtil.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    clearCanvasImage(this.imageData)

    this.canvas.classList.add('pixelated')
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
    this.context = DomUtil.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    clearCanvasImage(this.imageData)

    this.orgImageData = new ImageData(WIDTH, HEIGHT)
    clearCanvasImage(this.orgImageData)
  }

  public render(nes: Nes): void {
    nes.render(this.orgImageData.data)

    // Copy per scanline
    const src = this.orgImageData.data
    const dst = this.imageData.data
    const s = 187
    for (let y = 0; y < HEIGHT; ++y) {
      // Even line: original color
      let si = y * (WIDTH * 4)
      let di = si * 2
      for (let x = 0; x < WIDTH; ++x) {
        dst[di + 0] = src[si + 0]  // R
        dst[di + 1] = src[si + 1]  // G
        dst[di + 2] = src[si + 2]  // B
        si += 4
        di += 4
      }

      // Odd line: half color
      si = y * (WIDTH * 4)
      for (let x = 0; x < WIDTH; ++x) {
        dst[di + 0] = (src[si + 0] * s) >> 8  // R
        dst[di + 1] = (src[si + 1] * s) >> 8  // G
        dst[di + 2] = (src[si + 2] * s) >> 8  // B
        si += 4
        di += 4
      }
    }

    this.context.putImageData(this.imageData, 0, 0)
  }
}

// EPX: https://en.wikipedia.org/wiki/Pixel-art_scaling_algorithms#EPX/Scale2%C3%97/AdvMAME2%C3%97
export class EpxScaler extends Scaler {
  private context: CanvasRenderingContext2D
  private orgImageData: ImageData
  private imageData: ImageData

  public constructor() {
    super()

    this.canvas = createCanvas(WIDTH * 2, HEIGHT * 2)
    this.context = DomUtil.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    clearCanvasImage(this.imageData)

    this.orgImageData = new ImageData(WIDTH, HEIGHT)
    clearCanvasImage(this.orgImageData)
  }

  public render(nes: Nes): void {
    nes.render(this.orgImageData.data)

    const src = this.orgImageData.data
    const dst = this.imageData.data
    for (let y = 0; y < HEIGHT; ++y) {
      const y0 = Math.max(y - 1, 0) | 0
      const y2 = Math.min(y + 1, HEIGHT - 1) | 0
      for (let x = 0; x < WIDTH; ++x) {
        const x0 = Math.max(x - 1, 0) | 0
        const x2 = Math.min(x + 1, WIDTH - 1) | 0

        const pc = (y  * WIDTH + x ) * 4
        const pu = (y0 * WIDTH + x ) * 4
        const pd = (y2 * WIDTH + x ) * 4
        const pl = (y  * WIDTH + x0) * 4
        const pr = (y  * WIDTH + x2) * 4
        const cc = (src[pc + 0] << 16) | (src[pc + 1] << 8) | src[pc + 2]
        const cu = (src[pu + 0] << 16) | (src[pu + 1] << 8) | src[pu + 2]
        const cd = (src[pd + 0] << 16) | (src[pd + 1] << 8) | src[pd + 2]
        const cl = (src[pl + 0] << 16) | (src[pl + 1] << 8) | src[pl + 2]
        const cr = (src[pr + 0] << 16) | (src[pr + 1] << 8) | src[pr + 2]

        let d1 = cc, d2 = cc, d3 = cc, d4 = cc
        if (cl === cu && cl !== cd && cu !== cr)
          d1 = cu
        if (cu === cr && cu !== cl && cr !== cd)
          d2 = cr
        if (cd === cl && cd !== cr && cl !== cu)
          d3 = cl
        if (cr === cd && cr !== cu && cd !== cl)
          d4 = cd

        const di = (y * (WIDTH * 2) + x) * (4 * 2)
        dst[di + 0] =  d1 >> 16
        dst[di + 1] = (d1 >>  8) & 0xff
        dst[di + 2] =  d1        & 0xff
        dst[di + 4] =  d2 >> 16
        dst[di + 5] = (d2 >>  8) & 0xff
        dst[di + 6] =  d2        & 0xff
        dst[di + (0 + WIDTH * 8)] =  d3 >> 16
        dst[di + (1 + WIDTH * 8)] = (d3 >>  8) & 0xff
        dst[di + (2 + WIDTH * 8)] =  d3        & 0xff
        dst[di + (4 + WIDTH * 8)] =  d4 >> 16
        dst[di + (5 + WIDTH * 8)] = (d4 >>  8) & 0xff
        dst[di + (6 + WIDTH * 8)] =  d4        & 0xff
      }
    }

    this.context.putImageData(this.imageData, 0, 0)
  }
}
