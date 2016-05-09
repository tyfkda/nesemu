const WIDTH = 256
const HEIGHT = 240

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export class NesEmu {
  private root: HTMLElement
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  public static main(rootId: string) {
    const nesEmu = new NesEmu(rootId)
    nesEmu.run()
    return nesEmu
  }

  constructor(rootId: string) {
    this.root = document.getElementById(rootId)
    if (this.root) {
      this.canvas = createCanvas(WIDTH, HEIGHT)
      this.context = this.canvas.getContext('2d')
      this.imageData = this.context.getImageData(0, 0, WIDTH, HEIGHT)
      this.root.appendChild(this.canvas)
    }
  }

  public run() {
    const pixels = this.imageData.data
    for (let i = 0; i < HEIGHT; ++i) {
      for (let j = 0; j < WIDTH; ++j) {
        const index = (i * WIDTH + j) * 4
        pixels[index + 0] = j
        pixels[index + 1] = i
        pixels[index + 2] = 255
        pixels[index + 3] = 255
      }
    }
    this.context.putImageData(this.imageData, 0, 0)
  }
}
