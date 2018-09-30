declare function __non_webpack_require__(fn: string)

const fs = __non_webpack_require__('fs')

import {Nes} from '../../src/nes/nes'
import {PadValue} from '../../src/nes/apu'

const KEY_X = 27
const KEY_Z = 29
const ARROW_RIGHT = 79
const ARROW_LEFT = 80
const ARROW_DOWN = 81
const ARROW_UP = 82
const RETURN = 40
const ESCAPE = 41
const SPACE = 44

const kScanCode2PadValue: {[key: number]: number} = {
  [ARROW_RIGHT]: PadValue.R,
  [ARROW_LEFT]: PadValue.L,
  [ARROW_DOWN]: PadValue.D,
  [ARROW_UP]: PadValue.U,
  [KEY_X]: PadValue.A,
  [KEY_Z]: PadValue.B,
  [RETURN]: PadValue.START,
  [SPACE]: PadValue.SELECT,
}

function createMyApp() {
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

  const CPU_HZ = 1789773
  const MAX_ELAPSED_TIME = 1000 / 15

  class MyApp {
    private win: any
    private texture: any
    private pixels = new Uint8Array(WIDTH * HEIGHT * 4)
    private prevTime = 0

    private nes: Nes
    private pad = 0

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
        this.render()
      })
      this.win.on('keydown', (key) => {
        if (key.scancode === ESCAPE)
          process.exit(0)

        const v = kScanCode2PadValue[key.scancode]
        if (v)
          this.pad |= v
      })
      this.win.on('keyup', (key) => {
        const v = kScanCode2PadValue[key.scancode]
        if (v)
          this.pad &= ~v
      })

      this.texture = this.win.render.createTexture(
        256, 240, SDL_PIXELFORMAT_ABGR8888, SDL_TEXTUREACCESS_STREAMING)

      this.nes = Nes.create()
      this.nes.setVblankCallback((leftV) => { this.onVblank(leftV) })
      this.nes.reset()
    }

    public run(romData: Buffer): void {
      const result = this.nes.setRomData(romData)
      if (result !== true)
        throw result
      this.nes.reset()

      this.prevTime = Date.now()
      setInterval(() => {
        const now = Date.now()
        const elapsedTime = now - this.prevTime
        this.loop(elapsedTime)
        this.prevTime = now
      }, 1000 / 100)
    }

    private loop(elapsedTime: number): void {
      this.nes.setPadStatus(0, this.pad)

      let et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
      const cycles = (CPU_HZ * et / 1000) | 0
      this.nes.runCycles(cycles)
    }

    private onVblank(leftV: number) {
      if (leftV < 1)
        this.render()
      //this.updateAudio()
    }

    private render(): void {
      this.nes.render(this.pixels)

      const pitch = WIDTH * 4
      this.texture.update(null, this.pixels, pitch)
      this.win.render.copy(this.texture, null, null)

      this.win.render.present()
    }
  }

  //const myApp = new MyApp()

  return new MyApp()
}

if (process.argv.length < 3) {
  console.error('ROMFILE')
  process.exit(1)
}

fs.readFile(process.argv[2], (err, data) => {
  if (err) {
    throw err
  }

  const myApp = createMyApp()
  myApp.run(data)
})
