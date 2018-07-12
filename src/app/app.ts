import {Nes} from '../nes/nes'
import {MirrorMode} from '../nes/ppu'

import {AppEvent} from './app_event'
import {AudioManager} from '../util/audio_manager'
import {GamepadManager} from '../util/gamepad_manager'
import {KeyCode} from '../util/key_code'
import {PadKeyHandler} from '../util/pad_key_handler'
import {ScreenWnd, PaletWnd, NameTableWnd, PatternTableWnd,
        RegisterWnd, TraceWnd, ControlWnd} from './ui'
import Util from '../util/util'
import WindowManager from '../wnd/window_manager'

import * as Pubsub from '../util/pubsub'

const CPU_HZ = 1789773
const MAX_ELAPSED_TIME = 1000 / 15

function download(blob: Blob, filename: string) {
  const objectURL = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectURL
  a.setAttribute('download', filename)
  a.click()
}

function chooseFile(callback: (files: any) => void) {
  const elem = document.createElement('input')
  elem.setAttribute('type', 'file')
  elem.setAttribute('accept', '.sav, application/json')
  elem.addEventListener('change', function(event) {
    callback((event.target as any).files)
  })
  elem.click()
}

export class App {
  protected destroying = false
  protected isBlur = false
  protected rafId: number|null  // requestAnimationFrame
  protected nes: Nes
  protected padKeyHandler: PadKeyHandler
  protected audioManager = new AudioManager()
  protected stream = new AppEvent.Stream()
  protected subscription: Pubsub.Subscription

  protected title: string
  protected screenWnd: ScreenWnd
  protected hasPaletWnd: boolean
  protected hasNameTableWnd: boolean
  protected hasPatternTableWnd: boolean

  protected hasRegisterWnd = false
  protected hasTraceWnd = false
  protected hasCtrlWnd = false

  public static create(wndMgr: WindowManager, option: any): App {
    return new App(wndMgr, option)
  }

  constructor(wndMgr: WindowManager, option: any)
  constructor(wndMgr: WindowManager, option: any, noDefault: boolean)
  constructor(protected wndMgr: WindowManager, option: any, noDefault?: boolean) {
    if (noDefault)
      return

    this.nes = Nes.create()
    window.nes = this.nes  // Put nes into global.
    this.nes.setVblankCallback((leftV) => { this.onVblank(leftV) })
    this.nes.setBreakPointCallback(() => { this.onBreakPoint() })

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
          this.nes.getCpu().pause(false)
          break
        case AppEvent.Type.PAUSE:
          this.nes.getCpu().pause(true)
          break
        case AppEvent.Type.STEP:
          this.nes.step(0)
          break
        case AppEvent.Type.RESET:
          this.nes.reset()
          break
        }
      })

    this.screenWnd = new ScreenWnd(this.wndMgr, this, this.nes, this.stream)
    this.wndMgr.add(this.screenWnd)
    this.title = (option.title as string) || 'NES'
    this.screenWnd.setTitle(this.title)

    const size = this.screenWnd.getWindowSize()
    let x = Util.clamp((option.centerX || 0) - size.width / 2,
                       0, window.innerWidth - size.width - 1)
    let y = Util.clamp((option.centerY || 0) - size.height / 2,
                       0, window.innerHeight - size.height - 1)
    this.screenWnd.setPos(x, y)

    this.padKeyHandler = new PadKeyHandler()
    this.setUpKeyEvent(this.screenWnd.getContentHolder(), this.padKeyHandler)

    this.startLoopAnimation()
  }

  public loadRom(romData: Uint8Array): boolean {
    if (!this.nes.setRomData(romData)) {
      alert(`Illegal ROM format`)
      return false
    }
    this.nes.reset()
    this.nes.getCpu().pause(false)
    this.screenWnd.getContentHolder().focus()
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

  public saveData() {
    const saveData = this.nes.save()
    const content = JSON.stringify(saveData)
    const blob = new Blob([content], {type: 'text/plain'})
    download(blob, `${this.title}.sav`)
  }

  public loadData() {
    chooseFile(files => {
      if (files.length < 1) {
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const json = JSON.parse((event.target as any).result)
          this.nes.load(json)
        } catch (e) {
          console.error(e)
        }
      }
      reader.readAsText(files[0])
    })
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
                                          this.nes.getPpu().getMirrorMode() === MirrorMode.HORZ)
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
    if (this.hasRegisterWnd)
      return false
    const registerWnd = new RegisterWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(registerWnd)
    registerWnd.setPos(410, 500)
    registerWnd.setCallback(action => {
      if (action === 'close') {
        this.hasRegisterWnd = false
      }
    })

    return this.hasRegisterWnd = true
  }

  public createControlWnd(): boolean {
    if (this.hasCtrlWnd)
      return false
    const ctrlWnd = new ControlWnd(this.wndMgr, this.stream)
    this.wndMgr.add(ctrlWnd)
    ctrlWnd.setPos(520, 500)
    ctrlWnd.setCallback((action) => {
      if (action === 'close') {
        this.hasCtrlWnd = false
      }
    })

    return this.hasCtrlWnd = true
  }

  protected cleanUp() {
    this.cancelLoopAnimation()
    this.destroying = true
    this.audioManager.destroy()

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

      this.loop(elapsedTime)
      this.stream.triggerEndCalc()
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
    if (this.nes.getCpu().isPaused())
      return

    const isActive = this.screenWnd.isTop()
    for (let i = 0; i < 2; ++i) {
      let pad = 0
      if (isActive)
        pad = this.padKeyHandler.getStatus(i) | GamepadManager.getState(i)
      this.nes.setPadStatus(i, pad)
    }

    const et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
    let cycles = (CPU_HZ * et / 1000) | 0
    this.nes.runCycles(cycles)
  }

  protected render(): void {
    this.stream.triggerRender()
  }

  protected updateAudio(): void {
    const apu = this.nes.getApu()
    for (let ch = 0; ch < AudioManager.CHANNEL_COUNT; ++ch) {
      const volume = apu.getVolume(ch)
      this.audioManager.setChannelVolume(ch, volume)
      if (volume > 0)
        this.audioManager.setChannelFrequency(ch, apu.getFrequency(ch))
    }
  }

  protected setUpKeyEvent(root: HTMLElement, padKeyHandler: PadKeyHandler): void {
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
