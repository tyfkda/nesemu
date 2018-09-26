// JS-powered NES
// Run JavaScript code, instead of 6502 CPU.

import {App} from './app'
import {AppEvent} from './app_event'
import {Bus} from '../nes/bus'
import {Nes} from '../nes/nes'
import {Ppu} from '../nes/ppu'
import {ScreenWnd, RegisterWnd} from './ui'
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
  togglePause(): boolean
  pause(value: boolean): void
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
    this.mapperNo = 0
    this.mapper = this.createMapper(this.mapperNo)

    return this.reload()
  }

  public reload(): Promise<void> {
    return Util.loadFile(this.file)
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

  public render(pixels: Uint8ClampedArray): void {
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

  private static createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    canvas.width = width
    canvas.height = height
    canvas.className = 'full-size'
    Util.setStyles(canvas, {
      display: 'block',
    })
    Util.clearCanvas(canvas)
    return canvas
  }

  public constructor(wndMgr: WindowManager, private jsApp: JsApp, private jsNes: JsNes,
                     stream: AppEvent.Stream)
  {
    super(wndMgr, jsApp, jsNes, stream)

    this.canvas = JsScreenWnd.createCanvas(WIDTH, HEIGHT)
    this.context = Util.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    this.canvas.className = 'pixelated full-size'

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
            label: 'Pause',
            click: () => {
              if (this.jsNes.jsCpu.togglePause())
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
            label: 'Registers',
            click: () => {
              this.app.createRegisterWnd()
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

export class JsRegisterWnd extends RegisterWnd {
  public constructor(wndMgr: WindowManager, private jsNes: JsNes, stream: AppEvent.Stream) {
    super(wndMgr, jsNes, stream)

    const content = this.createContent()
    this.setContent(content)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.close()
          break
        case AppEvent.Type.RESET:
        case AppEvent.Type.STEP:
        case AppEvent.Type.PAUSE:
        case AppEvent.Type.BREAK_POINT:
          this.updateStatus()
          break
        }
      })
  }

  public updateStatus(): void {
    const regs = this.jsNes.jsCpu.getRegs()
    this.valueElems[0].value = regs[5].toString()
    this.valueElems[1].value = Util.hex(regs[0], 2)
    this.valueElems[2].value = Util.hex(regs[1], 2)
    this.valueElems[3].value = Util.hex(regs[2], 2)
    this.valueElems[4].value = Util.hex(regs[3], 2)
    this.valueElems[5].value = Util.hex(regs[4], 2)
    // this.valueElems[6].value = String(this.nes.cycleCount)
  }
}

export class JsApp extends App {
  private jsNes: JsNes
  private jsScreenWnd: JsScreenWnd
  private leftTime = 0

  constructor(wndMgr: WindowManager, option: any) {
    super(wndMgr, option, true)
    this.jsNes = new JsNes()
    window.jsNes = this.jsNes  // Put jsNes into global.
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
  }

  public setFile(file: File): void {
    this.cancelLoopAnimation()
    this.jsNes.setFile(file)
      .then(() => {
        this.startLoopAnimation()
      })
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

      // this.stream.triggerStartCalc()
      const curTime = window.performance.now()
      const elapsedTime = curTime - lastTime
      lastTime = curTime

      this.loop(elapsedTime)
      // this.stream.triggerEndCalc()
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
    for (let i = 0; i < 2; ++i) {
      const pad =  this.wndMgr.getPadStatus(this.screenWnd, i)
      this.nes.setPadStatus(i, pad)
    }

    let et = elapsedTime + this.leftTime
    let frameCount = Math.min((et * 60 / 1000) | 0, MAX_FRAME_COUNT)
    if (frameCount > 0) {
      const ppu = this.jsNes.getPpu()
      for (let i = 0; i < frameCount; ++i) {
        ppu.clearVBlank()
        this.jsNes.update()
        // this.updateAudio()
        ppu.setVBlank()
      }
      this.jsScreenWnd.render()

      this.stream.triggerRender()
    }
  }

  public createRegisterWnd(): boolean {
    if (this.hasRegisterWnd)
      return false
    const registerWnd = new JsRegisterWnd(this.wndMgr, this.jsNes, this.stream)
    this.wndMgr.add(registerWnd)
    registerWnd.setPos(410, 500)
    registerWnd.setCallback(action => {
      if (action === 'close') {
        this.hasRegisterWnd = false
      }
    })

    return this.hasRegisterWnd = true
  }
}
