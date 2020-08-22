// JS-powered NES
// Run JavaScript code, instead of 6502 CPU.

import App, {AppWndType, Option} from './app'
import {AppEvent} from './app_event'
import AudioManager from '../util/audio_manager'
import Bus from '../nes/bus'
import DomUtil from '../util/dom_util'
import Nes from '../nes/nes'
import Ppu from '../nes/ppu/ppu'
import ScreenWnd from './screen_wnd'
import Util from '../util/util'
import WindowManager from '../wnd/window_manager'

const WIDTH = 256
const HEIGHT = 240

const MAX_FRAME_COUNT = 4

interface JsCpu {
  init(bus: Bus, ppu: Ppu): void
  getChrRom(): Uint8Array
  reset(): void
  update(): void
  step(): void
  pause(value: boolean): void
  isPaused(): boolean
  getRegs(): number[]
}

class JsNes extends Nes {
  public jsCpu: JsCpu
  private file: File

  public constructor() {
    super()
    this.reset()
  }

  public setFile(file: File): Promise<void> {
    if (file == null)
      return Promise.reject('null')
    this.file = file

    // TODO: Detect mapper.
    this.setMemoryMap()
    const mapperNo = 0
    this.mapper = this.createMapper(mapperNo, -1)

    return this.reload()
  }

  public reload(): Promise<void> {
    return DomUtil.loadFile(this.file)
      .then(data => {
        // const jsCode = String.fromCharCode.apply('', data)
        const jsCode = new TextDecoder('utf-8').decode(data)
        /* tslint:disable:no-eval */
        this.jsCpu = eval(jsCode)
        /* tslint:enable:no-eval */
        this.ppu.setChrData(this.jsCpu.getChrRom())
        this.jsCpu.init(this.bus, this.ppu)
        return Promise.resolve()
      })
  }

  public reset(): void {
    this.ram.fill(0xff)
    this.ppu.reset()
    this.apu.reset()
    if (this.jsCpu != null)
      this.jsCpu.reset()
  }

  public update(): void {
    this.jsCpu.update()
  }

  public step(_leftCycles?: number): number {
    this.jsCpu.step()
    return 1  // Dummy
  }
}

class JsScreenWnd extends ScreenWnd {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  private static createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = width
    canvas.height = height
    canvas.className = 'full-size'
    DomUtil.setStyles(canvas, {
      display: 'block',
    })
    DomUtil.clearCanvas(canvas)
    return canvas
  }

  public constructor(wndMgr: WindowManager, private jsApp: JsApp, private jsNes: JsNes,
                     stream: AppEvent.Stream)
  {
    super(wndMgr, jsApp, jsNes, stream)

    this.canvas = JsScreenWnd.createCanvas(WIDTH, HEIGHT)
    this.context = DomUtil.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    this.canvas.className = 'pixelated full-size'

    this.setContent(this.canvas)

    wndMgr.add(this)
  }

  public render(): void {
    this.jsNes.render(this.imageData.data)
    this.context.putImageData(this.imageData, 0, 0)
  }

  protected setUpMenuBar(): void {
    this.addMenuBar([
      {
        label: 'File',
        submenu: [
          {
            label: 'Pause',
            click: () => {
              if (this.jsNes.jsCpu.isPaused())
                this.stream.triggerRun()
              else
                this.stream.triggerPause()
            },
          },
          {
            label: 'Reset',
            click: () => {
              this.stream.triggerReset()
//              this.stream.triggerRun()
            },
          },
          {
            label: 'Reload',
            click: () => {
              this.jsApp.reload()
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
        label: 'Debug',
        submenu: [
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
            label: 'Control',
            click: () => {
              this.app.createControlWnd()
            },
          },
        ],
      },
    ])
  }
}

export default class JsApp extends App {
  private jsNes: JsNes
  private jsScreenWnd: JsScreenWnd
  private leftTime = 0

  constructor(wndMgr: WindowManager, option: Option) {
    super(wndMgr, option, true)
    this.jsNes = new JsNes()
    this.jsScreenWnd = new JsScreenWnd(this.wndMgr, this, this.jsNes, this.stream)
    if (option.title)
      this.jsScreenWnd.setTitle(option.title as string)

    this.subscription = this.stream
      .subscribe((type, param?) => this.handleAppEvent(type, param))

    this.nes = this.jsNes
    this.wndMap[AppWndType.SCREEN] = this.screenWnd = this.jsScreenWnd

    const size = this.screenWnd.getWindowSize()
    let x = Util.clamp((option.centerX || 0) - size.width / 2,
                       0, window.innerWidth - size.width - 1)
    let y = Util.clamp((option.centerY || 0) - size.height / 2,
                       0, window.innerHeight - size.height - 1)
    this.screenWnd.setPos(x, y)
  }

  public setFile(file: File): void {
    this.jsNes.setFile(file)
      .then(() => {
        this.audioManager = new AudioManager()
        this.setupAudioManager()
      })
  }

  public reload(): void {
    this.jsNes.reload()
  }

  protected handleAppEvent(type: AppEvent.Type, param?: any) {
    switch (type) {
    case AppEvent.Type.RUN:
      this.jsNes.jsCpu.pause(false)
      break
    case AppEvent.Type.PAUSE:
      this.jsNes.jsCpu.pause(true)
      break
    case AppEvent.Type.STEP:
      this.jsNes.step()
      break
    case AppEvent.Type.RESET:
      this.jsNes.reset()
      break
    default:
      return super.handleAppEvent(type, param)
    }
  }

  protected update(elapsedTime: number): void {
    for (let i = 0; i < 2; ++i) {
      const pad = this.screenWnd.getPadStatus(i)
      this.nes.setPadStatus(i, pad)
    }

    const et = elapsedTime + this.leftTime
    let frameCount = (et * 60 / 1000) | 0
    if (frameCount <= MAX_FRAME_COUNT) {
      this.leftTime = et - ((frameCount * 1000 / 60) | 0)
    } else {
      frameCount = MAX_FRAME_COUNT
      this.leftTime = 0
    }

    frameCount *= this.screenWnd.getTimeScale()

    if (frameCount > 0) {
      const ppu = this.jsNes.getPpu()
      for (let i = 0; i < frameCount; ++i) {
        ppu.clearVBlank()
        this.jsNes.update()
        this.updateAudio()
        ppu.setHcount(240)
        ppu.setVBlank()
      }
      this.jsScreenWnd.render()

      this.stream.triggerRender()
    }
  }
}
