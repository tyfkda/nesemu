import {Nes} from '../nes/nes'
import {MirrorMode} from '../nes/ppu/types'

import {AppEvent} from './app_event'
import {AudioManager} from '../util/audio_manager'
import {KeyCode} from '../util/key_code'
import {ScreenWnd, PaletWnd, NameTableWnd, PatternTableWnd,
        RegisterWnd, TraceWnd, ControlWnd} from './ui'
import StorageUtil from '../util/storage_util'
import Util from '../util/util'
import WindowManager from '../wnd/window_manager'
import Wnd from '../wnd/wnd'

import * as Pubsub from '../util/pubsub'

const CPU_HZ = 1789773
const MAX_ELAPSED_TIME = 1000 / 15
export const DEFAULT_MASTER_VOLUME = 0.125

export class Option {
  public title?: string
  public centerX?: number
  public centerY?: number
  public onClosed?: (app: App) => void
}

export const enum AppWndType {
  SCREEN = 1,
  PALET,
  NAME,
  PATTERN,
  REGISTER,
  TRACE,
  CONTROL,
}

export class App {
  protected destroying = false
  protected isBlur = false
  protected rafId?: number  // requestAnimationFrame
  protected nes: Nes
  protected audioManager: AudioManager
  protected stream = new AppEvent.Stream()
  protected subscription: Pubsub.Subscription

  protected title: string
  protected screenWnd: ScreenWnd
  protected wndMap: {[key: number]: Wnd} = {}

  protected volume = 1

  public static create(wndMgr: WindowManager, option: Option): App {
    return new App(wndMgr, option)
  }

  constructor(protected wndMgr: WindowManager, protected option: Option, noDefault?: boolean) {
    if (noDefault)
      return

    this.nes = Nes.create()
    window.app = this  // Put app into global.
    this.nes.setVblankCallback((leftV) => { this.onVblank(leftV) })
    this.nes.setBreakPointCallback(() => { this.onBreakPoint() })

    this.subscription = this.stream
      .subscribe((type, param?) => this.handleAppEvent(type, param))

    const screenWnd = new ScreenWnd(this.wndMgr, this, this.nes, this.stream)
    this.wndMap[AppWndType.SCREEN] = this.screenWnd = screenWnd
    this.wndMgr.add(this.screenWnd)
    this.title = (option.title as string) || 'NES'
    this.screenWnd.setTitle(this.title)

    const size = this.screenWnd.getWindowSize()
    let x = Util.clamp((option.centerX || 0) - size.width / 2,
                       0, window.innerWidth - size.width - 1)
    let y = Util.clamp((option.centerY || 0) - size.height / 2,
                       0, window.innerHeight - size.height - 1)
    this.screenWnd.setPos(x, y)
  }

  protected handleAppEvent(type: AppEvent.Type, param?: any) {
    switch (type) {
    case AppEvent.Type.RENDER:
      break
    case AppEvent.Type.RUN:
      this.nes.getCpu().pause(false)
      break
    case AppEvent.Type.PAUSE:
      this.nes.getCpu().pause(true)
      this.muteAudio()
      break
    case AppEvent.Type.STEP:
      this.nes.step(0)
      break
    case AppEvent.Type.RESET:
      this.nes.reset()
      break
    case AppEvent.Type.OPEN_MENU:
      this.cancelLoopAnimation()
      this.muteAudio()
      break
    case AppEvent.Type.CLOSE_MENU:
      this.startLoopAnimation()
      break
    case AppEvent.Type.CLOSE_WND:
      {
        const wnd = param as Wnd
        const key = Object.keys(this.wndMap).find(key => this.wndMap[key] === wnd)
        if (key != null) {
          delete this.wndMap[key]
          if (parseInt(key) === AppWndType.SCREEN) {
            this.destroy()
          }
        }
      }
      break
    }
  }

  public setVolume(vol: number): void {
    this.volume = vol
    this.audioManager.setMasterVolume(this.volume * DEFAULT_MASTER_VOLUME)
  }

  public loadRom(romData: Uint8Array): boolean|string {
    const result = this.nes.setRomData(romData)
    if (result !== true)
      return result

    const contextClass = window.AudioContext || window.webkitAudioContext
    // if (contextClass == null)
    //   return

    this.audioManager = new AudioManager(contextClass)
    this.setupAudioManager()

    this.nes.reset()
    this.nes.getCpu().pause(false)
    this.screenWnd.getContentHolder().focus()

    this.startLoopAnimation()

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

  public close(): void {
    this.screenWnd.close()
  }

  public saveData() {
    const saveData = this.nes.save()
    StorageUtil.putObject(this.title, saveData)
  }

  public loadData() {
    const saveData = StorageUtil.getObject(this.title, null)
    if (saveData) {
      try {
        this.nes.load(saveData)
      } catch (e) {
        console.error(e)
        this.wndMgr.showSnackbar('Error: Load data failed')
        this.nes.reset()
      }
    } else {
      this.wndMgr.showSnackbar(`No save data for "${this.title}"`)
    }
  }

  public onBlur() {
    if (this.isBlur)
      return
    this.isBlur = true
    // this.cancelLoopAnimation()
    if (this.audioManager)
      this.audioManager.setMasterVolume(0)
  }

  public onFocus() {
    if (!this.isBlur)
      return
    this.isBlur = false
    // this.startLoopAnimation()
    if (this.audioManager)
      this.audioManager.setMasterVolume(this.volume * DEFAULT_MASTER_VOLUME)
  }

  public createPaletWnd(): boolean {
    if (this.wndMap[AppWndType.PALET] != null)
      return false
    const paletWnd = new PaletWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(paletWnd)
    paletWnd.setPos(520, 0)
    this.wndMap[AppWndType.PALET] = paletWnd
    return true
  }

  public createNameTableWnd(): boolean {
    if (this.wndMap[AppWndType.NAME] != null)
      return false
    const nameTableWnd = new NameTableWnd(this.wndMgr, this.nes, this.stream,
                                          this.nes.getPpu().getMirrorMode() === MirrorMode.HORZ)
    this.wndMgr.add(nameTableWnd)
    nameTableWnd.setPos(520, 40)
    this.wndMap[AppWndType.NAME] = nameTableWnd
    return true
  }

  public createPatternTableWnd(): boolean {
    if (this.wndMap[AppWndType.PATTERN] != null)
      return false

    const paletWnd = this.wndMap[AppWndType.PALET] as PaletWnd
    const getSelectedPalets = (buf: Uint8Array) => {
      if (paletWnd != null)
        paletWnd.getSelectedPalets(buf)
      else
        buf[0] = buf[1] = 0
    }
    const patternTableWnd = new PatternTableWnd(this.wndMgr, this.nes, this.stream,
                                                getSelectedPalets)
    this.wndMgr.add(patternTableWnd)
    patternTableWnd.setPos(520, 300)
    this.wndMap[AppWndType.PATTERN] = patternTableWnd
    return true
  }

  public createTraceWnd(): boolean {
    if (this.wndMap[AppWndType.TRACE] != null)
      return false
    const traceWnd = new TraceWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(traceWnd)
    traceWnd.setPos(0, 500)
    this.wndMap[AppWndType.TRACE] = traceWnd

    return true
  }

  public createRegisterWnd(): boolean {
    if (this.wndMap[AppWndType.REGISTER] != null)
      return false
    const registerWnd = new RegisterWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(registerWnd)
    registerWnd.setPos(410, 500)
    this.wndMap[AppWndType.REGISTER] = registerWnd

    return true
  }

  public createControlWnd(): boolean {
    if (this.wndMap[AppWndType.CONTROL] != null)
      return false
    const ctrlWnd = new ControlWnd(this.wndMgr, this.stream)
    this.wndMgr.add(ctrlWnd)
    ctrlWnd.setPos(520, 500)
    this.wndMap[AppWndType.CONTROL] = ctrlWnd

    return true
  }

  protected destroy() {
    for (let wnd of Object.values(this.wndMap))
      wnd.close()

    this.cleanUp()
    if (this.option.onClosed)
      this.option.onClosed(this)
  }

  protected cleanUp() {
    this.cancelLoopAnimation()
    this.destroying = true
    if (this.audioManager)
      this.audioManager.release()

    this.subscription.unsubscribe()
  }

  protected onVblank(leftV: number): void {
    if (leftV < 1)
      this.render()
    this.updateAudio()
  }

  protected onBreakPoint(): void {
    this.stream.triggerBreakPoint()
  }

  protected startLoopAnimation(): void {
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

      this.update(elapsedTime)
      this.stream.triggerEndCalc()
      this.rafId = requestAnimationFrame(loopFn)
    }
    this.rafId = requestAnimationFrame(loopFn)
  }

  protected cancelLoopAnimation(): void {
    if (this.rafId == null)
      return
    cancelAnimationFrame(this.rafId)
    this.rafId = undefined
  }

  protected update(elapsedTime: number): void {
    if (this.nes.getCpu().isPaused())
      return

    for (let i = 0; i < 2; ++i) {
      const pad =  this.wndMgr.getPadStatus(this.screenWnd, i)
      this.nes.setPadStatus(i, pad)
    }

    let et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
    et = (this.wndMgr.getKeyPressing(this.screenWnd, KeyCode.SHIFT)
          ? et * 4 : et)

    const cycles = (CPU_HZ * et / 1000) | 0
    this.nes.runCycles(cycles)
  }

  protected render(): void {
    this.stream.triggerRender()
  }

  protected updateAudio(): void {
    const audioManager = this.audioManager
    const count = audioManager.getChannelCount()
    for (let ch = 0; ch < count; ++ch) {
      const volume = this.nes.getSoundVolume(ch)
      audioManager.setChannelVolume(ch, volume)
      if (volume > 0) {
        audioManager.setChannelFrequency(ch, this.nes.getSoundFrequency(ch))
        audioManager.setChannelDutyRatio(ch, this.nes.getSoundDutyRatio(ch))
      }
    }
  }

  protected muteAudio(): void {
    const n = this.audioManager.getChannelCount()
    for (let ch = 0; ch < n; ++ch)
      this.audioManager.setChannelVolume(ch, 0)
  }

  protected setupAudioManager() {
    this.audioManager.release()

    this.audioManager.setMasterVolume(this.volume * DEFAULT_MASTER_VOLUME)
    const channelTypes = this.nes.getSoundChannelTypes()
    for (const type of channelTypes) {
      this.audioManager.addChannel(type)
    }
  }
}
