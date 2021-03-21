import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'
import {MenuItemInfo, WndEvent} from '../wnd/types'

import {DomUtil} from '../util/dom_util'
import {Nes} from '../nes/nes'
import {MirrorMode} from '../nes/ppu/types'
import {Scaler, NearestNeighborScaler, ScanlineScaler, EpxScaler} from '../util/scaler'

import {App} from './app'
import {AppEvent} from './app_event'
import {PadBit, PadValue} from '../nes/apu'
import {PadKeyHandler} from '../util/pad_key_handler'
import {GamepadManager} from '../util/gamepad_manager'
import {RegisterWnd, TraceWnd, ControlWnd} from './debug_wnd'
import {FpsWnd, PaletWnd, NameTableWnd, PatternTableWnd, AudioWnd} from './other_wnd'
import {Fds} from '../nes/fds/fds'
import {FdsCtrlWnd} from './fds_ctrl_wnd'

import * as Pubsub from '../util/pubsub'

const WIDTH = 256 | 0
const HEIGHT = 240 | 0
const HEDGE = 4 | 0
const VEDGE = 8 | 0

const TRANSITION_DURATION = '0.1s'

const TIME_SCALE_NORMAL = 1
const TIME_SCALE_FAST = 4

const enum WndType {
  PALET = 1,
  NAME,
  PATTERN,
  AUDIO,
  REGISTER,
  TRACE,
  CONTROL,
  FPS,
  FDS_CTRL,
}

const enum ScalerType {
  NEAREST,
  SCANLINE,
  EPX,
}

function takeScreenshot(wndMgr: WindowManager, screenWnd: ScreenWnd): Wnd {
  const img = document.createElement('img')
  const title = String(Date.now())
  img.src = screenWnd.capture()
  img.className = 'pixelated full-size'
  img.title = img.alt = title

  const imgWnd = new Wnd(wndMgr, WIDTH, HEIGHT, title)
  imgWnd.setContent(img)
  imgWnd.addResizeBox()
  wndMgr.add(imgWnd)
  return imgWnd
}

function fitAspectRatio(width: number, height: number, ratio: number): [number, number] {
  if (width / height >= ratio)
    width = height * ratio
  else
    height = width / ratio
  return [width, height]
}

function maxSize(wndMgr: WindowManager, overscan: boolean): {rootRect: DOMRect, width: number, height: number} {
  const rootRect = wndMgr.getRootClientRect()
  const maxWidth = rootRect.width - 2  // -2 for border size
  const maxHeight = rootRect.height - Wnd.TITLEBAR_HEIGHT - Wnd.MENUBAR_HEIGHT - 2

  const w = Math.round(WIDTH - (overscan ? HEDGE * 2 : 0))
  const h = Math.round(HEIGHT - (overscan ? VEDGE * 2 : 0))
  const [width, height] = fitAspectRatio(maxWidth, maxHeight, w / h)
  return {rootRect, width, height}
}

export class ScreenWnd extends Wnd {
  protected subscription: Pubsub.Subscription
  private fullscreenBase: HTMLElement
  private canvasHolder: HTMLElement
  private scaler: Scaler
  private overscan = true
  private contentWidth = 0  // Content size, except fullscreen
  private contentHeight = 0
  private menuItems: Array<MenuItemInfo>
  private scalerType = ScalerType.NEAREST
  private padKeyHandler = new PadKeyHandler()
  private timeScale = 1
  private fullscreenResizeFunc: () => void
  private repeatBtnFrame = false

  protected wndMap = new Array<Wnd | null>()

  constructor(wndMgr: WindowManager, protected app: App, protected nes: Nes,
              protected stream: AppEvent.Stream)
  {
    super(wndMgr, (WIDTH - HEDGE * 2) * 2, (HEIGHT - VEDGE * 2) * 2 + Wnd.MENUBAR_HEIGHT, 'NES')
    if (app == null || nes == null || stream == null)
      return

    this.setUpMenuBar()
    this.contentHolder.style.overflow = 'hidden'

    this.fullscreenBase = document.createElement('div')
    this.fullscreenBase.className = 'full-size'
    DomUtil.setStyles(this.fullscreenBase, {
      position: 'relative',
      overflow: 'hidden',
    })
    this.setContent(this.fullscreenBase)

    this.canvasHolder = document.createElement('div')
    this.canvasHolder.style.transitionDuration = TRANSITION_DURATION
    this.fullscreenBase.appendChild(this.canvasHolder)

    this.setScaler(ScalerType.NEAREST)
    this.addResizeBox()

    this.subscription = this.stream
      .subscribe((type: AppEvent.Type, param?: any) => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        case AppEvent.Type.RESET:
          this.scaler.reset()
          break
        case AppEvent.Type.CLOSE_WND:
          {
            const wnd = param as Wnd
            const i = this.wndMap.indexOf(wnd)
            if (i >= 0)
              this.wndMap[i] = null
          }
          break
        }
      })

    this.contentWidth = (WIDTH - HEDGE * 2) * 2
    this.contentHeight = (HEIGHT - VEDGE * 2) * 2
    this.updateContentSize(this.contentWidth, this.contentHeight)

    {
      const {width, height} = maxSize(this.wndMgr, this.overscan)
      if (width < (WIDTH - HEDGE * 2) * 2) {
        this.setClientSize(width, height)
      }
    }

    this.fullscreenResizeFunc = () => {
      const bounding = document.body.getBoundingClientRect()
      let width = bounding.width
      let height = bounding.height
      if (width / height >= WIDTH / HEIGHT) {
        width = (height * (WIDTH / HEIGHT)) | 0
      } else {
        height = (width * (HEIGHT / WIDTH)) | 0
      }
      DomUtil.setStyles(this.fullscreenBase, {
        width: `${width}px`,
        height: `${height}px`,
        margin: 'auto',
      })
      this.updateContentSize(width, height)
    }

    wndMgr.add(this)

    if (window.$DEBUG) {  // Accessing global variable!!!
      this.createPaletWnd()
      this.createNameTableWnd()
      this.createPatternTableWnd()
      this.createTraceWnd()
      this.createRegisterWnd()
      this.createControlWnd()
    }
  }

  public getTimeScale(): number {
    return this.timeScale
  }

  public onEvent(event: WndEvent, param?: any): any {
    switch (event) {
    case WndEvent.DRAG_BEGIN:
      this.stream.triggerPauseApp()
      break
    case WndEvent.DRAG_END:
      this.stream.triggerResumeApp()
      break
    case WndEvent.RESIZE_BEGIN:
      this.canvasHolder.style.transitionDuration = '0s'
      this.stream.triggerPauseApp()
      break
    case WndEvent.RESIZE_END:
      this.canvasHolder.style.transitionDuration = TRANSITION_DURATION
      this.stream.triggerResumeApp()
      break
    case WndEvent.RESIZE_MOVE:
      {
        const {width, height} = param
        this.onResized(width, height)
      }
      break
    case WndEvent.OPEN_MENU:
      this.stream.triggerPauseApp()
      break
    case WndEvent.CLOSE_MENU:
      this.stream.triggerResumeApp()
      break
    case WndEvent.UPDATE_FRAME:
      {
        this.padKeyHandler.update(this.wndMgr.getKeyboardManager())
        const speedUp = (this.isTop() &&
                         this.wndMgr.getKeyboardManager().getKeyPressing('ShiftLeft'))
        this.timeScale = speedUp ? TIME_SCALE_FAST : TIME_SCALE_NORMAL

        const elapsed = param as number
        this.stream.triggerStartCalc()
        this.stream.triggerUpdate(elapsed)
        this.stream.triggerEndCalc()

        this.repeatBtnFrame = !this.repeatBtnFrame
      }
      break
    case WndEvent.FOCUS:
      if (!param) {
        this.timeScale = TIME_SCALE_NORMAL
        this.padKeyHandler.clearAll()
      }
      break
    default:
      break
    }
  }

  public onResized(width: number, height: number): void {
    this.contentWidth = width
    this.contentHeight = height
    this.updateContentSize(width, height - Wnd.MENUBAR_HEIGHT)
  }

  public setClientSize(width: number, height: number): Wnd {
    width = Math.round(width)
    height = Math.round(height)
    super.setClientSize(width, height)
    this.contentWidth = width
    this.contentHeight = height
    this.updateContentSize(width, height)
    return this
  }

  public capture(): string {
    return this.scaler.getCanvas().toDataURL()
  }

  public getPadStatus(padNo: number): number {
    if (!this.isTop() || this.wndMgr.isBlur())
      return 0
    let state = this.padKeyHandler.getStatus(padNo) | GamepadManager.getState(padNo)
    if (this.repeatBtnFrame)
      state |= (state & (PadValue.REPEAT_A | PadValue.REPEAT_B)) >> (PadBit.REPEAT_A - PadBit.A)
    return state
  }

  public setFullscreen(callback?: (isFullscreen: boolean) => boolean): boolean {
    window.addEventListener('resize', this.fullscreenResizeFunc)
    return this.wndMgr.setFullscreen(this.contentHolder, isFullscreen => {
      if (!isFullscreen) {
        window.removeEventListener('resize', this.fullscreenResizeFunc)
        DomUtil.setStyles(this.fullscreenBase, {
          width: '',
          height: '',
          margin: '',
        })
        DomUtil.setStyles(this.contentHolder, {
          backgroundColor: '',
          display: '',
        })
        this.updateContentSize(this.contentWidth, this.contentHeight)
      } else {
        DomUtil.setStyles(this.contentHolder, {
          backgroundColor: 'black',
          display: 'flex',  // To locate vertically middle.
        })
      }
      if (callback)
        callback(isFullscreen)
      this.contentHolder.focus()
    })
  }

  public close(): void {
    this.closeChildrenWindows()

    if (this.subscription != null)
      this.subscription.unsubscribe()
    this.stream.triggerCloseWnd(this)
    super.close()
  }

  public render(): void {
    this.scaler.render(this.nes)
  }

  public createFdsCtrlWnd(fds: Fds): boolean {
    return this.createSubWnd(WndType.FDS_CTRL, () => {
      return new FdsCtrlWnd(this.wndMgr, fds)
    })
  }

  protected closeChildrenWindows(): void {
    for (const wnd of Object.values(this.wndMap))
      if (wnd != null)
        wnd.close()
  }

  protected setClientScale(scale: number): Wnd {
    const w = ((WIDTH - (this.overscan ? HEDGE * 2 : 0)) * scale) | 0
    const h = ((HEIGHT - (this.overscan ? VEDGE * 2 : 0)) * scale) | 0
    return this.setClientSize(w, h)
  }

  protected updateContentSize(width: number, height: number): void {
    if (!this.fullscreenBase)
      return

    const w = !this.overscan ? width : (width * (WIDTH / (WIDTH - HEDGE * 2))) | 0
    const h = !this.overscan ? height : (height * (HEIGHT / (HEIGHT - VEDGE * 2))) | 0
    const left = !this.overscan ? 0 : -(w * HEDGE / WIDTH) | 0
    const top = !this.overscan ? 0 : -(h * VEDGE / HEIGHT) | 0
    DomUtil.setStyles(this.canvasHolder, {
      position: 'absolute',
      width: `${w}px`,
      height: `${h}px`,
      top: `${top}px`,
      left: `${left}px`,
    })
  }

  protected setUpMenuBar(): void {
    this.menuItems = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Pause',
            checked: () => this.nes.getCpu().isPaused(),
            click: () => {
              if (this.nes.getCpu().isPaused())
                this.stream.triggerRun()
              else
                this.stream.triggerPause()
            },
          },
          {
            label: 'Reset',
            click: () => {
              this.stream.triggerReset()
              this.stream.triggerRun()
            },
          },
          {
            label: 'Screenshot',
            click: () => {
              takeScreenshot(this.wndMgr, this)
            },
          },
          {label: '----'},
          {
            label: 'Save status',
            click: () => this.app.saveData(),
          },
          {
            label: 'Download status to file',
            click: () => this.app.saveDataAs(),
          },
          {label: '----'},
          {
            label: 'Load status',
            disabled: () => !this.app.hasSaveData(),
            click: () => this.app.loadData(),
          },
          {
            label: 'Restore status from file',
            click: () => this.app.loadDataFromFile(),
          },
          {label: '----'},
          {
            label: 'Quit',
            click: () => {
              this.close()
            },
          },
        ],
      },
      {
        label: 'View',
        submenu: [
          {
            label: '1x1',
            checked: () => this.isAspectRatio(1),
            click: () => {
              this.setClientScale(1)
            },
          },
          {
            label: '2x2',
            checked: () => this.isAspectRatio(2),
            click: () => {
              this.setClientScale(2)
            },
          },
          {
            label: 'Adjust aspect ratio',
            disabled: () => this.isAspectRatio(0),
            click: () => {
              this.adjustAspectRatio()
            },
          },
          {label: '----'},
          {
            label: 'Fullscreen',
            click: () => {
              this.setFullscreen()
            },
          },
          {label: '----'},
          {
            label: 'Overscan',
            checked: () => this.overscan,
            click: () => {
              this.toggleOverscan()
            },
          },
          {
            label: 'Sprite flicker',
            checked: () => !this.nes.getPpu().suppressSpriteFlicker,
            click: () => {
              this.toggleSpriteFlicker()
            },
          },
        ],
      },
      {
        label: 'Scaler',
        submenu: [
          {
            label: 'Nearest',
            checked: () => this.scalerType === ScalerType.NEAREST,
            click: () => {
              this.setScaler(ScalerType.NEAREST)
            },
          },
          {
            label: 'Scanline',
            checked: () => this.scalerType === ScalerType.SCANLINE,
            click: () => {
              this.setScaler(ScalerType.SCANLINE)
            },
          },
          {
            label: 'Epx',
            checked: () => this.scalerType === ScalerType.EPX,
            click: () => {
              this.setScaler(ScalerType.EPX)
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
              this.createPaletWnd()
            },
          },
          {
            label: 'NameTable',
            click: () => {
              this.createNameTableWnd()
            },
          },
          {
            label: 'PatternTable',
            click: () => {
              this.createPatternTableWnd()
            },
          },
          {
            label: 'Audio',
            click: () => {
              this.createAudioWnd()
            },
          },
          {
            label: 'FPS',
            click: () => {
              this.createFpsWnd()
            },
          },
          {label: '----'},
          {
            label: 'Trace',
            click: () => {
              this.createTraceWnd()
            },
          },
          {
            label: 'Registers',
            click: () => {
              this.createRegisterWnd()
            },
          },
          {
            label: 'Control',
            click: () => {
              this.createControlWnd()
            },
          },
        ],
      },
    ]
    this.addMenuBar(this.menuItems)
  }

  protected maximize(): void {
    const {rootRect, width, height} = maxSize(this.wndMgr, this.overscan)
    const x = (rootRect.width - (width + 2)) / 2
    const y = (rootRect.height - (height + Wnd.TITLEBAR_HEIGHT + Wnd.MENUBAR_HEIGHT + 2)) / 2
    this.setPos(Math.round(x), Math.round(y))
    this.setClientSize(width, height)
  }

  protected createSubWnd(wndType: WndType, generate: () => Wnd): boolean {
    if (this.wndMap[wndType] != null) {
      this.wndMgr.moveToTop(this.wndMap[wndType]!)
      return false
    }
    const wnd = generate()
    this.wndMap[wndType] = wnd
    return true
  }

  protected createPaletWnd(): boolean {
    return this.createSubWnd(WndType.PALET, () => {
      const wnd = new PaletWnd(this.wndMgr, this.nes, this.stream)
      wnd.setPos(520, 0)
      return wnd
    })
  }

  protected createNameTableWnd(): boolean {
    return this.createSubWnd(WndType.NAME, () => {
      const ppu = this.nes.getPpu()
      const wnd = new NameTableWnd(this.wndMgr, ppu, this.stream,
                                   ppu.getMirrorMode() === MirrorMode.HORZ)
      wnd.setPos(520, 40)
      return wnd
    })
  }

  protected createPatternTableWnd(): boolean {
    return this.createSubWnd(WndType.PATTERN, () => {
      const getSelectedPalets = (buf: Uint8Array): boolean => {
        const paletWnd = this.wndMap[WndType.PALET] as PaletWnd
        if (paletWnd == null)
          return false
        paletWnd.getSelectedPalets(buf)
        return true
      }
      const wnd = new PatternTableWnd(this.wndMgr, this.nes.getPpu(), this.stream,
                                      getSelectedPalets)
      wnd.setPos(520, 300)
      return wnd
    })
  }

  protected createAudioWnd(): boolean {
    return this.createSubWnd(WndType.AUDIO, () =>
        new AudioWnd(this.wndMgr, this.nes, this.stream))
  }

  protected createTraceWnd(): boolean {
    return this.createSubWnd(WndType.TRACE, () => {
      const wnd = new TraceWnd(this.wndMgr, this.nes, this.stream)
      wnd.setPos(0, 500)
      return wnd
    })
  }

  protected createRegisterWnd(): boolean {
    return this.createSubWnd(WndType.REGISTER, () => {
      const wnd = new RegisterWnd(this.wndMgr, this.nes, this.stream)
      wnd.setPos(410, 500)
      return wnd
    })
  }

  protected createControlWnd(): boolean {
    return this.createSubWnd(WndType.CONTROL, () => {
      const wnd = new ControlWnd(this.wndMgr, this.stream)
      wnd.setPos(520, 500)
      return wnd
    })
  }

  protected createFpsWnd(): boolean {
    return this.createSubWnd(WndType.FPS, () =>
        new FpsWnd(this.wndMgr, this.stream))
  }

  private isAspectRatio(scale: number): boolean {
    const rect = this.contentHolder.getBoundingClientRect()
    const w = WIDTH - (this.overscan ? HEDGE * 2 : 0)
    const h = HEIGHT - (this.overscan ? VEDGE * 2 : 0)

    if (scale > 0)
      return Math.abs(rect.width - w * scale) < 0.5 && Math.abs(rect.height - h * scale) < 0.5
    return Math.abs(rect.width / rect.height - w / h) < 0.005
  }

  private adjustAspectRatio(): void {
    const rect = this.contentHolder.getBoundingClientRect()
    const w = WIDTH - (this.overscan ? HEDGE * 2 : 0)
    const h = HEIGHT - (this.overscan ? VEDGE * 2 : 0)
    const [width, height] = fitAspectRatio(rect.width, rect.height, w / h)
    this.setClientSize(width, height)
  }

  private toggleOverscan(): void {
    this.overscan = !this.overscan
    this.updateContentSize(this.contentHolder.offsetWidth, this.contentHolder.offsetHeight)
  }

  private toggleSpriteFlicker(): void {
    const ppu = this.nes.getPpu()
    ppu.suppressSpriteFlicker = !ppu.suppressSpriteFlicker
  }

  private setScaler(type: ScalerType): void {
    const initial = this.scaler == null
    if (this.scalerType === type && !initial)
      return
    this.scalerType = type
    switch (type) {
    case ScalerType.NEAREST:
      this.scaler = new NearestNeighborScaler()
      break
    case ScalerType.SCANLINE:
      this.scaler = new ScanlineScaler()
      break
    case ScalerType.EPX:
      this.scaler = new EpxScaler()
      break
    }
    DomUtil.removeAllChildren(this.canvasHolder)
    this.canvasHolder.appendChild(this.scaler.getCanvas())

    if (!initial)
      this.render()
  }
}
