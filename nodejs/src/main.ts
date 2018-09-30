declare function __non_webpack_require__(fn: string)

const NS = __non_webpack_require__('node-sdl2')
const App = NS.app
const Window = NS.window

const SDL_TEXTUREACCESS_STREAMING = 1

const SDL_PIXELTYPE_PACKED32 = 6
const SDL_PACKEDORDER_ABGR = 7
const SDL_PACKEDLAYOUT_8888 = 6
const SDL_DEFINE_PIXELFORMAT = (type, order, layout, bits, bytes) => {
  return ((1 << 28) | ((type) << 24) | ((order) << 20) | ((layout) << 16) |
          ((bits) << 8) | ((bytes) << 0))
}

const SDL_PIXELFORMAT_ABGR8888 = SDL_DEFINE_PIXELFORMAT(SDL_PIXELTYPE_PACKED32, SDL_PACKEDORDER_ABGR,
                                                        SDL_PACKEDLAYOUT_8888, 32, 4)

const WIDTH = 256
const HEIGHT = 240

const TITLE = 'Nesemu'

class MyApp {
  private win: any
  private texture: any
  private pixels = new Uint8Array(WIDTH * HEIGHT * 4)
  private count = 0
  private nDraw = 0
  private prevTime = 0

  constructor() {
    this.win = new Window({
      title: TITLE,
      w: WIDTH * 2,
      h: HEIGHT * 2,
    })
    this.win.on('close', () => {
      App.quit()
    })
    this.win.on('change', () => {
      this.draw()
    })

    this.texture = this.win.render.createTexture(
      256, 240, SDL_PIXELFORMAT_ABGR8888, SDL_TEXTUREACCESS_STREAMING)

    this.prevTime = Date.now()
    setInterval(() => this.draw(), 1000 / 100)
  }

  private draw() {
    //this.win.render.color = {r: 255, g: 0, b: 255, a: 255}
    //this.win.render.clear()

    // FPS
    ++this.nDraw
    const now = Date.now()
    if (now - this.prevTime >= 1000) {
      this.win.title = `${TITLE}  (FPS:${this.nDraw})`
      this.prevTime = now
      this.nDraw = 0
    }

    if (++this.count >= 256)
      this.count = 0
    for (let i = 0; i < HEIGHT; ++i) {
      for (let j = 0; j < WIDTH; ++j) {
        const offset = (i * WIDTH + j) * 4
        this.pixels[offset + 0] = j
        this.pixels[offset + 1] = i
        this.pixels[offset + 2] = this.count
        this.pixels[offset + 3] = 255
      }
    }

    const pitch = WIDTH * 4
    this.texture.update(null, this.pixels, pitch)
    this.win.render.copy(this.texture, null, null)

    this.win.render.present()
  }
}

const myApp = new MyApp()
