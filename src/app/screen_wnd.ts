import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'
import {MenuItemInfo, SubmenuItemInfo, WndEvent} from '../wnd/types'

import {DomUtil} from '../util/dom_util'
import {Nes} from '../nes/nes'
import {MirrorMode} from '../nes/ppu/types'
import {Scaler, NearestNeighborScaler, ScanlineScaler, CrtScaler, EpxScaler} from '../util/scaler'

import {App} from './app'
import {AppEvent} from './app_event'
import {GlobalSetting} from './global_setting'
import {ScalerType} from './def'
import {PadBit, PadValue} from '../nes/apu'
import {PadKeyHandler} from '../util/pad_key_handler'
import {KeyboardManager} from '../util/keyboard_manager'
import {GamepadManager} from '../util/gamepad_manager'
import {Keyboard as NesKeyboard, KeyType} from '../nes/peripheral/keyboard'
import {RegisterWnd, RamWnd, TraceWnd, ControlWnd} from './debug_wnd'
import {FpsWnd, PaletWnd, NameTableWnd, PatternTableWnd, AudioWnd} from './other_wnd'
import {Fds} from '../nes/fds/fds'
import {FdsCtrlWnd} from './fds_ctrl_wnd'
import {Persistor, PersistToken} from '../util/persist'

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
  RAM,
  TRACE,
  CONTROL,
  FPS,
  FDS_CTRL,
}

const kKeyMapping: {[key: string]: KeyType} = {
  KeyA: KeyType.A,
  KeyB: KeyType.B,
  KeyC: KeyType.C,
  KeyD: KeyType.D,
  KeyE: KeyType.E,
  KeyF: KeyType.F,
  KeyG: KeyType.G,
  KeyH: KeyType.H,
  KeyI: KeyType.I,
  KeyJ: KeyType.J,
  KeyK: KeyType.K,
  KeyL: KeyType.L,
  KeyM: KeyType.M,
  KeyN: KeyType.N,
  KeyO: KeyType.O,
  KeyP: KeyType.P,
  KeyQ: KeyType.Q,
  KeyR: KeyType.R,
  KeyS: KeyType.S,
  KeyT: KeyType.T,
  KeyU: KeyType.U,
  KeyV: KeyType.V,
  KeyW: KeyType.W,
  KeyX: KeyType.X,
  KeyY: KeyType.Y,
  KeyZ: KeyType.Z,
  Digit0: KeyType.NUM0,
  Digit1: KeyType.NUM1,
  Digit2: KeyType.NUM2,
  Digit3: KeyType.NUM3,
  Digit4: KeyType.NUM4,
  Digit5: KeyType.NUM5,
  Digit6: KeyType.NUM6,
  Digit7: KeyType.NUM7,
  Digit8: KeyType.NUM8,
  Digit9: KeyType.NUM9,
  Enter: KeyType.RETURN,
  Space: KeyType.SPACE,
  Comma: KeyType.COMMA,
  Period: KeyType.PERIOD,
  Slash: KeyType.SLASH,
  BracketLeft: KeyType.LBRACKET,
  BracketRight: KeyType.RBRACKET,
  Escape: KeyType.ESC,
  Semicolon: KeyType.SEMICOLON,
  Quote: KeyType.COLON,
  Minus: KeyType.MINUS,
  Equal: KeyType.HAT,
  Backslash: KeyType.YEN,
  Insert: KeyType.INS,
  Backspace: KeyType.DEL,
  ShiftLeft: KeyType.LSHIFT,
  ShiftRight: KeyType.RSHIFT,
  ControlLeft: KeyType.CTR,
  ControlRight: KeyType.CTR,
  AltLeft: KeyType.GRPH,
  AltRight: KeyType.KANA,
  F1: KeyType.F1,
  F2: KeyType.F2,
  F3: KeyType.F3,
  F4: KeyType.F4,
  F5: KeyType.F5,
  F6: KeyType.F6,
  F7: KeyType.F7,
  F8: KeyType.F8,
  F11: KeyType.STOP,
  F12: KeyType.CLR_HOME,
  ArrowUp: KeyType.UP,
  ArrowDown: KeyType.DOWN,
  ArrowLeft: KeyType.LEFT,
  ArrowRight: KeyType.RIGHT,
}

type Size = {width: number, height: number}

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

function fitAspectRatio(width: number, height: number, ratio: number): Size {
  if (width / height >= ratio)
    width = Math.round(height * ratio) | 0
  else
    height = Math.round(width / ratio) | 0
  return {width, height}
}

function contentSize(overscan: boolean): Size {
  return {
    width: Math.round(WIDTH - (overscan ? HEDGE * 2 : 0)),
    height: Math.round(HEIGHT - (overscan ? VEDGE * 2 : 0)),
  }
}

function maxSize(wndMgr: WindowManager, overscan: boolean): {rootRect: DOMRect, width: number, height: number} {
  const rootRect = wndMgr.getRootClientRect()
  const maxWidth = rootRect.width - 2  // -2 for border size
  const maxHeight = rootRect.height - Wnd.TITLEBAR_HEIGHT - Wnd.MENUBAR_HEIGHT - 2

  const {width: w, height: h} = contentSize(overscan)
  const {width, height} = fitAspectRatio(maxWidth, maxHeight, w / h)
  return {rootRect, width, height}
}

export class ScreenWnd extends Wnd {
  protected subscription: Pubsub.Subscription
  private fullscreenBase: HTMLElement
  private canvasHolder: HTMLElement
  private messageHolder: HTMLElement
  private messageTimer: any
  private scaler: Scaler
  private overscan = true
  private contentWidth = 0  // Content size, except fullscreen
  private contentHeight = 0
  private menuItems: Array<MenuItemInfo>
  private scalerType: ScalerType = ScalerType.NEAREST
  private padKeyHandler = new PadKeyHandler()
  private domKeyboardManager = new KeyboardManager()
  private nesKeyboard: NesKeyboard
  private timeScale = 1
  private fullscreenResizeFunc: () => void
  private repeatBtnFrame = false
  private fileHandle: FileSystemFileHandle | null = null
  private persistTok?: PersistToken

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

    this.messageHolder = document.createElement('div')
    DomUtil.setStyles(this.messageHolder, {
      position: 'absolute',
      top: '2px',
      left: '2px',
      color: '#0f0',
      textShadow: '1px 1px black',
      fontWeight: 'bold',
      textWrap: 'nowrap',
      display: 'none',
    })
    this.messageHolder.innerText = 'State saved!'
    this.contentHolder.appendChild(this.messageHolder)

    this.setScaler(GlobalSetting.scaler)
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

    {
      this.overscan = GlobalSetting.overscan
      let {width, height} = contentSize(this.overscan)
      width *= 2
      height *= 2
      this.setClientSize(width, height)

      this.contentWidth = width
      this.contentHeight = height
      this.updateContentSize(this.contentWidth, this.contentHeight)
    }

    {
      const {width, height} = maxSize(this.wndMgr, this.overscan)
      if (width < this.contentWidth) {
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

    this.nes.getPpu().spriteFlicker = GlobalSetting.spriteFlicker

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
      if (GlobalSetting.pauseOnMenu)
        this.stream.triggerPauseApp()
      break
    case WndEvent.DRAG_END:
      if (GlobalSetting.pauseOnMenu)
        this.stream.triggerResumeApp()
      this.saveDimens()
      break
    case WndEvent.RESIZE_BEGIN:
      this.canvasHolder.style.transitionDuration = '0s'
      if (GlobalSetting.pauseOnMenu)
        this.stream.triggerPauseApp()
      break
    case WndEvent.RESIZE_END:
      this.saveClientSize(this.getClientSize())
      this.saveDimens()
      this.canvasHolder.style.transitionDuration = TRANSITION_DURATION
      if (GlobalSetting.pauseOnMenu)
        this.stream.triggerResumeApp()
      break
    case WndEvent.RESIZE_MOVE:
      {
        const {width, height} = param
        this.onResized(width, height)
      }
      break
    case WndEvent.OPEN_MENU:
      if (GlobalSetting.pauseOnMenu)
        this.stream.triggerPauseApp()
      break
    case WndEvent.CLOSE_MENU:
      if (GlobalSetting.pauseOnMenu)
        this.stream.triggerResumeApp()
      break
    case WndEvent.UPDATE_FRAME:
      {
        const elapsed = param as number
        this.update(elapsed)
      }
      break
    case WndEvent.FOCUS:
      if (!param) {
        this.timeScale = TIME_SCALE_NORMAL
        this.padKeyHandler.clearAll()
        this.domKeyboardManager.clear()
        this.nesKeyboard?.clearAll()
      }
      break

    case WndEvent.KEY_DOWN:
      {
        const event = param as KeyboardEvent
        if (!(event.ctrlKey || event.altKey || event.metaKey)) {
          event.preventDefault()
          this.domKeyboardManager.onKeyDown(event)
          if (this.nesKeyboard == null) {
            switch (event.code) {
            case 'F1':  // Save state
              this.saveData()
              break
            case 'F3':  // Load state
              this.loadData()
              break
            default: break
            }
          }
        }

        if (this.nesKeyboard != null && event.code in kKeyMapping) {
          this.nesKeyboard.setKeyState(kKeyMapping[event.code], true)
          event.preventDefault()
        }
      }
      break

    case WndEvent.KEY_UP:
      {
        const event = param as KeyboardEvent
        if (!(event.ctrlKey || event.altKey || event.metaKey))
          this.domKeyboardManager.onKeyUp(event)
        if (this.nesKeyboard != null && event.code in kKeyMapping)
          this.nesKeyboard.setKeyState(kKeyMapping[event.code], false)
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

  public setClientSize(width: number, height: number): void {
    width = Math.round(width)
    height = Math.round(height)
    super.setClientSize(width, height)
    this.contentWidth = width
    this.contentHeight = height
    this.updateContentSize(width, height)
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

  public setFullscreen(): boolean {
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

  public setKeyboard(nesKeyboard: NesKeyboard): void {
    this.nesKeyboard = nesKeyboard
    this.nes.setPeripheral(this.nesKeyboard.getIoMap())
  }

  protected closeChildrenWindows(): void {
    for (const wnd of Object.values(this.wndMap))
      if (wnd != null)
        wnd.close()
  }

  protected setClientScale(scale: number): Size {
    let {width, height} = contentSize(this.overscan)
    width = (width * scale) | 0
    height = (height * scale) | 0
    this.setClientSize(width, height)
    return {width, height}
  }

  protected updateContentSize(width: number, height: number): void {
    if (!this.fullscreenBase)
      return

    const {width: w, height: h} = contentSize(this.overscan)
    const cw = (width * (WIDTH / w)) | 0
    const ch = (height * (HEIGHT / h)) | 0
    const left = !this.overscan ? 0 : -(cw * HEDGE / WIDTH) | 0
    const top = !this.overscan ? 0 : -(ch * VEDGE / HEIGHT) | 0
    DomUtil.setStyles(this.canvasHolder, {
      position: 'absolute',
      width: `${cw}px`,
      height: `${ch}px`,
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
            shortcut: 'F1',
            click: () => this.saveData(),
          },
          (window.showSaveFilePicker == null ? null : {
            label: window.showSaveFilePicker != null ? 'Save status to file' : 'Download status to file',
            disabled: () => this.fileHandle == null,
            click: () => this.app.saveDataTo(this.fileHandle!),
          }),
          {
            label: window.showSaveFilePicker != null ? 'Save status to file as...' : 'Download status to file',
            click: async () => {
              const fileHandle = await this.app.saveDataAs()
              if (fileHandle != null)
                this.fileHandle = fileHandle
            },
          },
          {label: '----'},
          {
            label: 'Load status',
            shortcut: 'F3',
            disabled: () => !this.app.hasSaveData(),
            click: () => this.loadData(),
          },
          {
            label: window.showOpenFilePicker != null ? 'Load status from file' : 'Restore status from file',
            click: async () => {
              this.fileHandle = await this.app.loadDataFromFile()
            },
          },
          {label: '----'},
          {
            label: 'Quit',
            click: () => {
              this.close()
            },
          },
        ].filter(x => x != null) as SubmenuItemInfo[],
      },
      {
        label: 'View',
        submenu: [
          {
            label: '1x1',
            checked: () => this.isAspectRatio(1),
            click: () => {
              const size = this.setClientScale(1)
              this.saveClientSize(size)
            },
          },
          {
            label: '2x2',
            checked: () => this.isAspectRatio(2),
            click: () => {
              const size = this.setClientScale(2)
              this.saveClientSize(size)
            },
          },
          {
            label: 'Adjust aspect ratio',
            disabled: () => this.isAspectRatio(0),
            click: () => {
              const size = this.adjustAspectRatio()
              this.saveClientSize(size)
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
              GlobalSetting.overscan = this.overscan
            },
          },
          {
            label: 'Sprite flicker',
            checked: () => this.nes.getPpu().spriteFlicker,
            click: () => {
              this.toggleSpriteFlicker()
              GlobalSetting.spriteFlicker = this.nes.getPpu().spriteFlicker
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
            click: () => this.updateScaler(ScalerType.NEAREST),
          },
          {
            label: 'Scanline',
            checked: () => this.scalerType === ScalerType.SCANLINE,
            click: () => this.updateScaler(ScalerType.SCANLINE),
          },
          {
            label: 'Crt',
            checked: () => this.scalerType === ScalerType.CRT,
            click: () => this.updateScaler(ScalerType.CRT),
          },
          {
            label: 'Epx',
            checked: () => this.scalerType === ScalerType.EPX,
            click: () => this.updateScaler(ScalerType.EPX),
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
            label: 'FPS',
            click: () => {
              this.createFpsWnd()
            },
          },
          {
            label: 'Keyboard',
            click: () => {
              this.createAudioWnd()
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
            label: 'Ram',
            click: () => {
              this.createRamWnd()
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

  public maximize(): void {
    const {rootRect, width, height} = maxSize(this.wndMgr, this.overscan)
    const x = (rootRect.width - (width + 2)) / 2
    const y = (rootRect.height - (height + Wnd.TITLEBAR_HEIGHT + Wnd.MENUBAR_HEIGHT + 2)) / 2
    this.setClientSize(width, height)
    this.setPos(Math.round(x), Math.round(y))
    GlobalSetting.maximize = true
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

  protected createRamWnd(): boolean {
    if (this.wndMap[WndType.RAM] != null)
      return false
    const wnd = new RamWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(wnd)
    this.wndMap[WndType.RAM] = wnd
    return true
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

  private update(elapsedTime: number) {
    this.padKeyHandler.update(this.domKeyboardManager)
    const speedUp = (this.nesKeyboard == null &&
                     this.domKeyboardManager.getKeyPressing('ShiftLeft'))
    this.timeScale = speedUp ? TIME_SCALE_FAST : TIME_SCALE_NORMAL

    this.stream.triggerStartCalc()
    this.stream.triggerUpdate(elapsedTime)
    this.stream.triggerEndCalc()

    this.repeatBtnFrame = !this.repeatBtnFrame
  }

  private isAspectRatio(scale: number): boolean {
    const rect = this.contentHolder.getBoundingClientRect()
    const {width, height} = contentSize(this.overscan)

    if (scale > 0)
      return Math.abs(rect.width - width * scale) < 0.5 && Math.abs(rect.height - height * scale) < 0.5
    return Math.abs(rect.width / rect.height - width / height) < 0.005
  }

  private adjustAspectRatio(): Size {
    const rect = this.contentHolder.getBoundingClientRect()
    const {width: w, height: h} = contentSize(this.overscan)
    const {width, height} = fitAspectRatio(rect.width, rect.height, w / h)
    this.setClientSize(width, height)
    return {width, height}
  }

  private saveClientSize(size: Size): void {
    GlobalSetting.clientWidth = size.width
    GlobalSetting.clientHeight = size.height
    GlobalSetting.maximize = false
  }

  protected saveDimens(): void {
    if (!GlobalSetting.persistCarts || !this.persistTok)
      return

    const { x, y } = this.getPos()
    const { width, height } = this.getClientSize()
    Persistor.updatePersistCoords(this.persistTok, x, y, width, height)
  }

  private toggleOverscan(): void {
    this.overscan = !this.overscan
    this.updateContentSize(this.contentHolder.offsetWidth, this.contentHolder.offsetHeight)
  }

  private toggleSpriteFlicker(): void {
    const ppu = this.nes.getPpu()
    ppu.spriteFlicker = !ppu.spriteFlicker
  }

  private updateScaler(type: ScalerType): void {
    if (this.scalerType === type)
      return
    GlobalSetting.scaler = type
    this.setScaler(type)
    this.render()
  }

  private setScaler(type: ScalerType): void {
    this.scalerType = type
    switch (type) {
    default:
    case ScalerType.NEAREST:
      this.scaler = new NearestNeighborScaler()
      break
    case ScalerType.SCANLINE:
      this.scaler = new ScanlineScaler()
      break
    case ScalerType.CRT:
      this.scaler = new CrtScaler()
      break
    case ScalerType.EPX:
      this.scaler = new EpxScaler()
      break
    }
    DomUtil.removeAllChildren(this.canvasHolder)
    this.canvasHolder.appendChild(this.scaler.getCanvas())
  }

  private saveData(): void {
    const message = this.app.saveData() ? 'State saved!' : 'Save failed.'
    this.showMessage(message)
  }

  private loadData(): void {
    if (this.app.loadData())  // Error is reported in the method.
    this.showMessage('State loaded!')
  }

  protected showMessage(message: string): void {
    if (this.messageTimer != null)
      clearTimeout(this.messageTimer)

    this.messageHolder.innerText = message
    DomUtil.setStyles(this.messageHolder, {
      display: 'block',
    })
    this.messageTimer = setTimeout(() => {
      DomUtil.setStyles(this.messageHolder, {
        display: 'none',
      })
      this.messageTimer = null
    }, 2000)
  }

  public setPersistTok(tok: PersistToken): void {
    this.persistTok = tok
  }
}
