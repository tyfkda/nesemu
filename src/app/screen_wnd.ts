import WindowManager from '../wnd/window_manager'
import Wnd, {WndEvent, MenuItemInfo} from '../wnd/wnd'

import DomUtil from '../util/dom_util'
import Nes from '../nes/nes'
import {Scaler, NearestNeighborScaler, ScanlineScaler, EpxScaler} from '../util/scaler'

import App from './app'
import {AppEvent} from './app_event'
import PadKeyHandler from '../util/pad_key_handler'
import GamepadManager from '../util/gamepad_manager'
import KeyCode from '../util/key_code'

import * as Pubsub from '../util/pubsub'

const WIDTH = 256 | 0
const HEIGHT = 240 | 0
const HEDGE = 0 | 0
const VEDGE = 8 | 0

const TRANSITION_DURATION = '0.1s'

const TIME_SCALE_NORMAL = 1
const TIME_SCALE_FAST = 4

const enum MenuType {
  FILE,
  VIEW,
  SCALER,
  DEBUG,
}

const enum FileMenuType {
  PAUSE,
  RESET,
  SCREENSHOT,
  SAVE,
  LOAD,
  QUIT,
}

const enum ViewMenuType {
  SCALE_1x1,
  SCALE_2x2,
  ADJUST_ASPECT_RATIO,
  FULLSCREEN,
}

const enum ScalerType {
  NEAREST,
  SCANLINE,
  EPX,
}

const enum DebugMenuType {
  EDGE,
  SPRITE_FLICKER,
}

let isAudioPermissionAcquired = false

function requireAudioPermission() {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  return isSafari
}

function takeScreenshot(wndMgr: WindowManager, screenWnd: ScreenWnd): Wnd {
  const img = document.createElement('img') as HTMLImageElement
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

export default class ScreenWnd extends Wnd {
  protected subscription: Pubsub.Subscription
  private fullscreenBase: HTMLElement
  private canvasHolder: HTMLElement
  private scaler: Scaler
  private hideEdge = true
  private contentWidth = 0  // Content size, except fullscreen
  private contentHeight = 0
  private menuItems: Array<MenuItemInfo>
  private scalerType = ScalerType.NEAREST
  private padKeyHandler = new PadKeyHandler()
  private timeScale = 1

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
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        case AppEvent.Type.RESET:
          this.scaler.reset()
          break
        }
      })

    this.contentWidth = (WIDTH - HEDGE * 2) * 2
    this.contentHeight = (HEIGHT - VEDGE * 2) * 2
    this.updateContentSize(this.contentWidth, this.contentHeight)

    if (!isAudioPermissionAcquired && requireAudioPermission()) {
      const button = document.createElement('button')
      button.innerText = 'Play audio'
      DomUtil.setStyles(button, {
        position: 'absolute',
        right: 0,
        top: 0,
      })
      button.addEventListener('click', (_event) => {
        this.app.setupAudioManager()
        this.fullscreenBase.removeChild(button)
        isAudioPermissionAcquired = true
      })
      this.fullscreenBase.appendChild(button)
    }
  }

  public getTimeScale(): number {
    return this.timeScale
  }

  public onEvent(event: WndEvent, param?: any): any {
    switch (event) {
    case WndEvent.DRAG_BEGIN:
      this.stream.triggerPauseApp()
      break;
    case WndEvent.DRAG_END:
      this.stream.triggerResumeApp()
      break;
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
      this.onOpenMenu()
      break
    case WndEvent.CLOSE_MENU:
      this.onCloseMenu()
      break
    case WndEvent.KEY_DOWN:
      {
        const event = param as KeyboardEvent
        if (event.keyCode === KeyCode.SHIFT)
          this.timeScale = TIME_SCALE_FAST
        if (!event.ctrlKey && !event.altKey && !event.metaKey)
          this.padKeyHandler.onKeyDown(event.keyCode)
      }
      break;
    case WndEvent.KEY_UP:
      {
        const event = param as KeyboardEvent
        if (event.keyCode === KeyCode.SHIFT)
          this.timeScale = TIME_SCALE_NORMAL
        if (!event.ctrlKey && !event.altKey && !event.metaKey)
          this.padKeyHandler.onKeyUp(event.keyCode)
      }
      break;
    case WndEvent.BLUR:
      this.timeScale = TIME_SCALE_NORMAL
      this.padKeyHandler.clearAll()
      break
    case WndEvent.UPDATE_FRAME:
      {
        const elapsed: number = param
        this.stream.triggerStartCalc()
        this.stream.triggerUpdate(elapsed)
        this.stream.triggerEndCalc()
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
    if (!this.isTop() || this.wndMgr.IsBlur())
      return 0;
    return this.padKeyHandler.getStatus(padNo) | GamepadManager.getState(padNo)
  }

  public setFullscreen(callback?: (isFullscreen: boolean) => boolean): boolean {
    return this.wndMgr.setFullscreen(this.contentHolder, (isFullscreen) => {
      if (isFullscreen) {
        let width = window.parent.screen.width
        let height = window.parent.screen.height
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
        this.contentHolder.style.backgroundColor = 'black'
        this.updateContentSize(width, height)
      } else {
        DomUtil.setStyles(this.fullscreenBase, {
          width: '',
          height: '',
          margin: '',
        })
        this.contentHolder.style.backgroundColor = ''
        this.updateContentSize(this.contentWidth, this.contentHeight)
      }
      if (callback)
        callback(isFullscreen)
      this.contentHolder.focus()
    })
  }

  public close(): void {
    if (this.subscription != null)
      this.subscription.unsubscribe()
    this.stream.triggerCloseWnd(this)
    super.close()
  }

  public render(): void {
    this.scaler.render(this.nes)
  }

  protected setClientScale(scale: number): Wnd {
    const w = ((WIDTH - (this.hideEdge ? HEDGE * 2 : 0)) * scale) | 0
    const h = ((HEIGHT - (this.hideEdge ? VEDGE * 2 : 0)) * scale) | 0
    return this.setClientSize(w, h)
  }

  protected updateContentSize(width: number, height: number) {
    if (!this.fullscreenBase)
      return

    const w = !this.hideEdge ? width : (width * (WIDTH / (WIDTH - HEDGE * 2))) | 0
    const h = !this.hideEdge ? height : (height * (HEIGHT / (HEIGHT - VEDGE * 2))) | 0
    const left = !this.hideEdge ? 0 : -(w * HEDGE / WIDTH) | 0
    const top = !this.hideEdge ? 0 : -(h * VEDGE / HEIGHT) | 0
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
          {
            label: 'Save',
            click: () => {
              if (this.app.saveData()) {
                const fileMenu = this.menuItems[MenuType.FILE].submenu
                fileMenu[FileMenuType.LOAD].disabled = false
              }
            },
          },
          {
            label: 'Load',
            click: () => {
              this.app.loadData()
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
        label: 'View',
        submenu: [
          {
            label: '1x1',
            click: () => {
              this.setClientScale(1)
            },
          },
          {
            label: '2x2',
            click: () => {
              this.setClientScale(2)
            },
          },
          {
            label: 'Adjust aspect ratio',
            click: () => {
              this.adjustAspectRatio()
            },
          },
          {
            label: 'Fullscreen',
            click: () => {
              this.setFullscreen()
            },
          },
        ],
      },
      {
        label: 'Scaler',
        submenu: [
          {
            label: 'Nearest',
            click: () => {
              this.setScaler(ScalerType.NEAREST)
            },
          },
          {
            label: 'Scanline',
            click: () => {
              this.setScaler(ScalerType.SCANLINE)
            },
          },
          {
            label: 'Epx',
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
            label: 'Edge',
            click: () => {
              this.toggleEdge()
            },
          },
          {
            label: 'Sprite flicker',
            click: () => {
              this.toggleSpriteFlicker()
            },
          },
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
            label: 'Audio',
            click: () => {
              this.app.createAudioWnd()
            },
          },
          {
            label: 'Trace',
            click: () => {
              this.app.createTraceWnd()
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
          {
            label: 'FPS',
            click: () => {
              this.app.createFpsWnd()
            },
          },
        ],
      },
    ]
    this.addMenuBar(this.menuItems)
  }

  protected onOpenMenu() {
    if (this.menuItems == null)
      return

    const rect = this.contentHolder.getBoundingClientRect()
    const w = (WIDTH - (this.hideEdge ? HEDGE * 2 : 0)) | 0
    const h = (HEIGHT - (this.hideEdge ? VEDGE * 2 : 0)) | 0

    const fileMenu = this.menuItems[MenuType.FILE].submenu
    fileMenu[FileMenuType.PAUSE].checked = this.nes.getCpu().isPaused()
    if (!('disabled' in fileMenu[FileMenuType.LOAD])) {
      fileMenu[FileMenuType.LOAD].disabled = !this.app.hasSaveData()
    }

    const viewMenu = this.menuItems[MenuType.VIEW].submenu
    viewMenu[ViewMenuType.SCALE_1x1].checked =
      Math.abs(rect.width - w) < 0.5 && Math.abs(rect.height - h) < 0.5
    viewMenu[ViewMenuType.SCALE_2x2].checked =
      Math.abs(rect.width - w * 2) < 0.5 && Math.abs(rect.height - h * 2) < 0.5
    viewMenu[ViewMenuType.ADJUST_ASPECT_RATIO].disabled =
      Math.abs(rect.width / rect.height - w / h) < 0.005

    const scalerMenu = this.menuItems[MenuType.SCALER].submenu
    for (let i = 0; i < scalerMenu.length; ++i) {
      scalerMenu[i].checked = this.scalerType === i
    }

    const ppu = this.nes.getPpu()
    const debugMenu = this.menuItems[MenuType.DEBUG].submenu
    debugMenu[DebugMenuType.EDGE].checked = !this.hideEdge
    debugMenu[DebugMenuType.SPRITE_FLICKER].checked = !ppu.suppressSpriteFlicker

    this.stream.triggerPauseApp()
  }

  protected onCloseMenu() {
    this.stream.triggerResumeApp()
  }

  protected maximize() {
    const winWidth = window.innerWidth
    const winHeight = window.innerHeight
    const maxWidth = winWidth - 2  // -2 for border size
    const maxHeight = winHeight - Wnd.TITLEBAR_HEIGHT - Wnd.MENUBAR_HEIGHT - 2

    const w = Math.round(WIDTH - (this.hideEdge ? HEDGE * 2 : 0))
    const h = Math.round(HEIGHT - (this.hideEdge ? VEDGE * 2 : 0))
    const [width, height] = fitAspectRatio(maxWidth, maxHeight, w / h)

    const x = (winWidth - (width + 2)) / 2
    const y = (winHeight - (height + Wnd.TITLEBAR_HEIGHT + Wnd.MENUBAR_HEIGHT + 2)) / 2
    this.setPos(Math.round(x), Math.round(y))
    this.setClientSize(width, height)
  }

  private adjustAspectRatio() {
    const rect = this.contentHolder.getBoundingClientRect()
    const w = WIDTH - (this.hideEdge ? HEDGE * 2 : 0)
    const h = HEIGHT - (this.hideEdge ? VEDGE * 2 : 0)
    const [width, height] = fitAspectRatio(rect.width, rect.height, w / h)
    this.setClientSize(width, height)
  }

  private toggleEdge() {
    this.hideEdge = !this.hideEdge
    this.updateContentSize(this.contentHolder.offsetWidth, this.contentHolder.offsetHeight)
  }

  private toggleSpriteFlicker() {
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
