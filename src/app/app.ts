import {Nes} from '../nes/nes'
import {MirrorMode} from '../nes/ppu'

import {AppEvent} from './app_event'
import {AudioManager} from './audio_manager'
import {GamepadManager} from './gamepad_manager'
import {KeyCode} from './key_code'
import {PadKeyHandler} from './pad_key_handler'
import {ScreenWnd, PaletWnd, NameTableWnd, PatternTableWnd,
        RegisterWnd, TraceWnd, ControlWnd} from './ui'
import StorageUtil from './storage_util'
import WindowManager from '../wnd/window_manager'

import * as Rx from 'rxjs/Rx'

const CPU_HZ = 1789773
const MAX_ELAPSED_TIME = 1000 / 15

function clamp(x, min, max) {
  if (x < min)
    return min
  if (max < min)
    max = min
  if (x > max)
    return max
  return x
}

export class App {
  private destroying = false
  private isBlur = false
  private rafId: number  // requestAnimationFrame
  private nes: Nes
  private padKeyHandler: PadKeyHandler
  private audioManager: AudioManager
  private stream: AppEvent.Stream
  private subscription: Rx.Subscription

  private screenWnd: ScreenWnd
  private hasPaletWnd: boolean
  private hasNameTableWnd: boolean
  private hasPatternTableWnd: boolean

  private hasRegisterWnd: boolean
  private hasTraceWnd: boolean
  private hasCtrlWnd: boolean

  public static setUp(): void {
    StorageUtil.setKeyPrefix('nesemu:')
    GamepadManager.setUp()
  }

  public static create(wndMgr: WindowManager, option: any): App {
    return new App(wndMgr, option)
  }

  constructor(private wndMgr: WindowManager, option: any) {
    this.nes = Nes.create()
    window.nes = this.nes  // Put nes into global.
    this.nes.setVblankCallback((leftCycles) => { this.onVblank(leftCycles) })
    this.nes.setBreakPointCallback(() => { this.onBreakPoint() })

    this.audioManager = new AudioManager()
    this.stream = new AppEvent.Stream()

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.cleanUp()
          if (option.onClosed)
            option.onClosed(this)
          break
        case AppEvent.Type.RENDER:
          break
        case AppEvent.Type.RUN:
          this.nes.cpu.pause(false)
          break
        case AppEvent.Type.PAUSE:
          this.nes.cpu.pause(true)
          break
        case AppEvent.Type.STEP:
          this.nes.step()
          break
        case AppEvent.Type.RESET:
          this.nes.reset()
          break
        }
      })

    this.screenWnd = new ScreenWnd(this.wndMgr, this, this.nes, this.stream)
    this.wndMgr.add(this.screenWnd)
    if (option.title)
      this.screenWnd.setTitle(option.title as string)

    const size = this.screenWnd.getWindowSize()
    let x = clamp((option.centerX || 0) - size.width / 2, 0, window.innerWidth - size.width - 1)
    let y = clamp((option.centerY || 0) - size.height / 2, 0, window.innerHeight - size.height - 1)
    this.screenWnd.setPos(x, y)

    this.padKeyHandler = new PadKeyHandler()
    this.setUpKeyEvent(this.screenWnd.getCanvas(), this.padKeyHandler)

    this.startLoopAnimation()
  }

  public loadRom(romData: Uint8Array): boolean {
    if (!this.nes.setRomData(romData)) {
      alert(`Illegal ROM format`)
      return false
    }
    this.nes.reset()
    this.nes.cpu.pause(false)
    this.screenWnd.setFocus()
    this.stream.triggerLoadRom()

    if (window.$DEBUG) {  // Accessing global variable!!!
      this.createPaletWnd()
      this.createNameTableWnd()
      this.createPatternTableWnd()
      this.createTraceWnd()
      this.createRegisterWnd()
      this.createControlWnd()
    }

    return true
  }

  public onBlur() {
    if (this.isBlur)
      return
    this.isBlur = true
    // this.cancelLoopAnimation()
    this.audioManager.setMasterVolume(0)
  }

  public onFocus() {
    if (!this.isBlur)
      return
    this.isBlur = false
    // this.startLoopAnimation()
    this.audioManager.setMasterVolume(1)
  }

  public createPaletWnd(): boolean {
    if (this.hasPaletWnd)
      return false
    const paletWnd = new PaletWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(paletWnd)
    paletWnd.setPos(520, 0)
    paletWnd.setCallback(action => {
      if (action === 'close') {
        this.hasPaletWnd = false
      }
    })
    return this.hasPaletWnd = true
  }

  public createNameTableWnd(): boolean {
    if (this.hasNameTableWnd)
      return false
    const nameTableWnd = new NameTableWnd(this.wndMgr, this.nes, this.stream,
                                          this.nes.ppu.mirrorMode === MirrorMode.HORZ)
    this.wndMgr.add(nameTableWnd)
    nameTableWnd.setPos(520, 40)
    nameTableWnd.setCallback(action => {
      if (action === 'close') {
        this.hasNameTableWnd = false
      }
    })
    return this.hasNameTableWnd = true
  }

  public createPatternTableWnd(): boolean {
    if (this.hasPatternTableWnd)
      return false
    const patternTableWnd = new PatternTableWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(patternTableWnd)
    patternTableWnd.setPos(520, 300)
    patternTableWnd.setCallback(action => {
      if (action === 'close') {
        this.hasPatternTableWnd = false
      }
    })
    return this.hasPatternTableWnd = true
  }

  public createTraceWnd(): boolean {
    if (this.hasTraceWnd)
      return false
    const traceWnd = new TraceWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(traceWnd)
    traceWnd.setPos(0, 500)
    traceWnd.setCallback(action => {
      if (action === 'close') {
        this.hasTraceWnd = false
      }
    })

    return this.hasTraceWnd = true
  }

  public createRegisterWnd(): boolean {
    if (this.hasRegisterWnd != null)
      return false
    const registerWnd = new RegisterWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(registerWnd)
    registerWnd.setPos(410, 500)
    registerWnd.setCallback(action => {
      if (action === 'close') {
        this.hasRegisterWnd = null
      }
    })

    return this.hasRegisterWnd = true
  }

  public createControlWnd(): boolean {
    if (this.hasCtrlWnd != null)
      return false
    const ctrlWnd = new ControlWnd(this.wndMgr, this.stream)
    this.wndMgr.add(ctrlWnd)
    ctrlWnd.setPos(520, 500)
    ctrlWnd.setCallback((action) => {
      if (action === 'close') {
        this.hasCtrlWnd = null
      }
    })

    return this.hasCtrlWnd = true
  }

  private cleanUp() {
    this.cancelLoopAnimation()
    this.destroying = true
    this.audioManager.destroy()

    this.subscription.unsubscribe()

    this.wndMgr = null
  }

  private onVblank(leftCycles: number): void {
    if (leftCycles < 1)
      this.render()

    for (let ch = 0; ch < AudioManager.CHANNEL; ++ch) {
      const volume = this.nes.apu.getVolume(ch)
      this.audioManager.setChannelVolume(ch, volume)
      if (volume > 0)
        this.audioManager.setChannelFrequency(ch, this.nes.apu.getFrequency(ch))
    }
  }

  private onBreakPoint(): void {
    this.stream.triggerBreakPoint()
  }

  private startLoopAnimation(): void {
    if (this.rafId != null)
      return

    let lastTime = window.performance.now()
    const loopFn = () => {
      if (this.destroying)
        return

      this.stream.triggerStartCalc()
      const curTime = window.performance.now()
      const elapsedTime = curTime - lastTime
      lastTime = curTime

      this.loop(elapsedTime)
      this.stream.triggerEndCalc()
      this.rafId = requestAnimationFrame(loopFn)
    }
    this.rafId = requestAnimationFrame(loopFn)
  }

  private cancelLoopAnimation(): void {
    if (this.rafId == null)
      return
    cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  private loop(elapsedTime: number): void {
    if (this.nes.cpu.isPaused())
      return

    const isTop = this.screenWnd.isTop()
    for (let i = 0; i < 2; ++i) {
      let pad = this.padKeyHandler.getStatus(i)
      if (isTop)
        pad |= GamepadManager.getState(i)
      this.nes.setPadStatus(i, pad)
    }

    const et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
    let cycles = (CPU_HZ * et / 1000) | 0
    this.nes.runCycles(cycles)
  }

  private render(): void {
    this.stream.triggerRender()
  }

  private setUpKeyEvent(root: HTMLElement, padKeyHandler: PadKeyHandler): void {
    root.setAttribute('tabindex', '1')  // To accept key event.
    root.style.outline = 'none'
    root.addEventListener('keydown', (event) => {
      if (event.ctrlKey) {  // Ctrl+W: Quit
        if (event.keyCode === KeyCode.W) {
          this.screenWnd.close()
          return
        }
      }

      if (event.ctrlKey || event.altKey || event.metaKey)
        return
      event.preventDefault()
      padKeyHandler.onKeyDown(event.keyCode)
    })
    root.addEventListener('keyup', (event) => {
      event.preventDefault()
      padKeyHandler.onKeyUp(event.keyCode)
    })
  }
}
