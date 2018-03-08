// JS-powered NES
// Run JavaScript code, instead of 6502 CPU.

import {App} from './app'
import {AppEvent} from './app_event'
import {Bus} from '../nes/bus'
import {GamepadManager} from '../util/gamepad_manager'
import {Nes} from '../nes/nes'
import {PadKeyHandler} from '../util/pad_key_handler'
import {ScreenWnd} from './ui'
import Util from '../util/util'
import WindowManager from '../wnd/window_manager'

const WIDTH = 256
const HEIGHT = 240

const MAX_FRAME_COUNT = 4

interface Program {
  init(bus: Bus): void
  getChrRom(): Uint8Array
  update(): void
}

class JsNes extends Nes {
  private file: File
  private program: Program

  public static create(): JsNes {
    return new JsNes()
  }

  public constructor() {
    super()
    this.reset()
  }

  public setFile(file: File): boolean {
    if (file == null)
      return false
    this.file = file

    // TODO: Detect mapper.
    this.setMemoryMap(0)

    this.reload()
    return true
  }

  public reload(): void {
    Util.loadFile(this.file)
      .then(data => {
        //const jsCode = String.fromCharCode.apply('', data)
        const jsCode = new TextDecoder('utf-8').decode(data)
        this.program = eval(jsCode)
        this.ppu.setChrData(this.program.getChrRom())
        this.program.init(this.bus)
      })
  }

  public reset(): void {
    this.ram.fill(0xff)
    this.ppu.reset()
    this.apu.reset()
    this.cycleCount = 0
  }

  public update(): void {
    this.program.update()
  }

  public render(pixels: Uint8ClampedArray): void {
    this.ppu.setVBlank()
    this.ppu.clearVBlank()
    this.ppu.render(pixels)
  }

  public renderPatternTable(pixels: Uint8ClampedArray, lineWidth: number, colors: number[]): void {
    this.ppu.renderPattern(pixels, lineWidth, colors)
  }
}

class JsScreenWnd extends ScreenWnd {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  public constructor(wndMgr: WindowManager, private jsApp: JsApp, private jsNes: JsNes,
                     stream: AppEvent.Stream)
  {
    super(wndMgr)
    this.app = jsApp
    this.nes = jsNes
    this.stream = stream

    this.setUpMenuBar()

    this.addResizeBox()

    this.canvas = JsScreenWnd.createCanvas(WIDTH, HEIGHT)
    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    this.canvas.className = 'pixelated'

    this.setContent(this.canvas)
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
        ],
      },
    ])
  }

  private static createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = width
    canvas.height = height
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    Util.clearCanvas(canvas)
    return canvas
  }
}

export class JsApp extends App {
  private jsNes: JsNes
  private jsScreenWnd: JsScreenWnd
  private leftTime = 0

  constructor(wndMgr: WindowManager, option: any) {
    super(wndMgr, option, true)
    this.jsNes = JsNes.create()
    this.jsScreenWnd = new JsScreenWnd(this.wndMgr, this, this.jsNes, this.stream)
    this.wndMgr.add(this.jsScreenWnd)
    if (option.title)
      this.jsScreenWnd.setTitle(option.title as string)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.cleanUp()
          if (option.onClosed)
            option.onClosed(this)
          break
        case AppEvent.Type.RESET:
          this.nes.reset()
          break
        }
      })

    this.nes = this.jsNes
    this.screenWnd = this.jsScreenWnd

    const size = this.screenWnd.getWindowSize()
    let x = Util.clamp((option.centerX || 0) - size.width / 2,
                       0, window.innerWidth - size.width - 1)
    let y = Util.clamp((option.centerY || 0) - size.height / 2,
                       0, window.innerHeight - size.height - 1)
    this.screenWnd.setPos(x, y)

    this.padKeyHandler = new PadKeyHandler()
    this.setUpKeyEvent(this.screenWnd.getRootElement(), this.padKeyHandler)

    this.startLoopAnimation()
  }

  public setFile(file: File): boolean {
    if (!this.jsNes.setFile(file)) {
      return false
    }
    return true
  }

  public reload(): void {
    this.cancelLoopAnimation()
    this.jsNes.reload()
    this.startLoopAnimation()
  }

  protected startLoopAnimation(): void {
    if (this.rafId != null)
      return

    let lastTime = window.performance.now()
    const loopFn = () => {
      if (this.destroying)
        return

      //this.stream.triggerStartCalc()
      const curTime = window.performance.now()
      const elapsedTime = curTime - lastTime
      lastTime = curTime

      this.loop(elapsedTime)
      //this.stream.triggerEndCalc()
      this.rafId = requestAnimationFrame(loopFn)
    }
    this.rafId = requestAnimationFrame(loopFn)
  }

  protected cancelLoopAnimation(): void {
    if (this.rafId == null)
      return
    cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  protected loop(elapsedTime: number): void {
    const isActive = this.screenWnd.isTop()
    for (let i = 0; i < 2; ++i) {
      let pad = 0
      if (isActive)
        pad = this.padKeyHandler.getStatus(i) | GamepadManager.getState(i)
      this.nes.setPadStatus(i, pad)
    }

    let et = elapsedTime + this.leftTime
    let frameCount = Math.min((et * 60 / 1000) | 0, MAX_FRAME_COUNT)
    if (frameCount > 0) {
      for (let i = 0; i < frameCount; ++i)
        this.jsNes.update()
      this.jsScreenWnd.render()
    }
  }
}
