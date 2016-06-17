import {Nes} from '../nes/nes.ts'
import {PadBit} from '../nes/apu.ts'

import {AudioManager} from './audio_manager.ts'
import {PadKeyHandler} from './pad_key_handler.ts'
import {ScreenWnd, PaletWnd, NameTableWnd, PatternTableWnd,
        RegisterWnd, TraceWnd, ControlWnd} from './ui.ts'

import WindowManager from '../wnd/window_manager.ts'

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
  private nes: Nes
  private padKeyHandler: PadKeyHandler
  private audioManager: AudioManager

  private screenWnd: ScreenWnd
  private paletWnd: PaletWnd
  private nameTableWnd: NameTableWnd
  private patternTableWnd: PatternTableWnd

  private registerWnd: RegisterWnd
  private traceWnd: TraceWnd
  private ctrlWnd: ControlWnd

  public static create(wndMgr: WindowManager, root: HTMLElement, option: any): App {
    return new App(wndMgr, root, option)
  }

  constructor(private wndMgr: WindowManager, private root: HTMLElement, option: any) {
    this.nes = Nes.create()
    window.nes = this.nes  // Put nes into global.
    this.nes.setVblankCallback((leftCycles) => { this.onVblank(leftCycles) })
    this.nes.setBreakPointCallback(() => { this.onBreakPoint() })

    this.audioManager = new AudioManager()

    this.screenWnd = new ScreenWnd(this, this.wndMgr, this.nes)
    this.wndMgr.add(this.screenWnd)
    if (option.title)
      this.screenWnd.setTitle(option.title as string)
    this.screenWnd.setCallback((action, ...params) => {
      switch (action) {
      case 'close':
        this.cleanUp()
        break
      default:
        break
      }
    })

    const size = this.screenWnd.getWindowSize()
    let x = clamp((option.centerX || 0) - size.width / 2, 0, window.innerWidth - size.width - 1)
    let y = clamp((option.centerY || 0) - size.height / 2, 0, window.innerHeight - size.height - 1)
    this.screenWnd.setPos(x, y)

    this.nes.cpu.pause(true)
    this.nes.reset()

    this.dumpCpu()

    this.padKeyHandler = new PadKeyHandler()
    this.setUpKeyEvent(this.screenWnd.getRootNode(), this.padKeyHandler)

    this.startLoopAnimation()
  }

  public loadRom(romData: Uint8Array): boolean {
    if (!this.nes.setRomData(romData)) {
      alert(`Illegal ROM format`)
      return false
    }
    this.nes.reset()
    this.nes.cpu.pause(false)
    if (this.traceWnd != null)
      this.traceWnd.reset()
    this.dumpCpu()
    this.updateButtonState()
    this.screenWnd.setFocus()
    return true
  }

  public createPaletWnd(): boolean {
    if (this.paletWnd != null)
      return false
    this.paletWnd = new PaletWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.paletWnd)
    this.paletWnd.setPos(520, 0)
    this.paletWnd.setCallback(action => {
      if (action === 'close') {
        this.paletWnd = null
      }
    })
    return true
  }

  public createNameTableWnd(): boolean {
    if (this.nameTableWnd != null)
      return false
    this.nameTableWnd = new NameTableWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.nameTableWnd)
    this.nameTableWnd.setPos(520, 40)
    this.nameTableWnd.setCallback(action => {
      if (action === 'close') {
        this.nameTableWnd = null
      }
    })
    return true
  }

  public createPatternTableWnd(): boolean {
    if (this.patternTableWnd != null)
      return false
    this.patternTableWnd = new PatternTableWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.patternTableWnd)
    this.patternTableWnd.setPos(520, 300)
    this.patternTableWnd.setCallback(action => {
      if (action === 'close') {
        this.patternTableWnd = null
      }
    })
    return true
  }

  public createTraceWnd(): boolean {
    if (this.traceWnd != null)
      return false
    this.traceWnd = new TraceWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.traceWnd)
    this.traceWnd.setPos(0, 500)
    this.traceWnd.setCallback(action => {
      if (action === 'close') {
        this.traceWnd = null
      }
    })

    this.dumpCpu()
    return true
  }

  public createRegisterWnd(): boolean {
    if (this.registerWnd != null)
      return false
    this.registerWnd = new RegisterWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.registerWnd)
    this.registerWnd.setPos(410, 500)
    this.registerWnd.setCallback(action => {
      if (action === 'close') {
        this.registerWnd = null
      }
    })

    this.dumpCpu()
    return true
  }

  public createControlWnd(): boolean {
    if (this.ctrlWnd != null)
      return false
    this.ctrlWnd = new ControlWnd(this.wndMgr, this.nes, this.screenWnd, this.audioManager)
    this.ctrlWnd.setCallback((action) => {
      switch (action) {
      case 'close':
        this.ctrlWnd = null
        break
      case 'step':
        this.dumpCpu()
        this.render()
        break
      case 'paused':
        this.dumpCpu()
        break
      case 'reset':
        this.traceWnd.reset()
        this.dumpCpu()
        break
      default:
        break
      }
    })
    this.wndMgr.add(this.ctrlWnd)
    this.ctrlWnd.setPos(520, 500)

    this.updateButtonState()
    return true
  }

  private cleanUp() {
    this.destroying = true
    this.audioManager.destroy()

    if (this.paletWnd != null) {
      this.paletWnd.close()
      this.paletWnd = null
    }
    if (this.nameTableWnd != null) {
      this.nameTableWnd.close()
      this.nameTableWnd = null
    }
    if (this.patternTableWnd != null) {
      this.patternTableWnd.close()
      this.patternTableWnd = null
    }
    if (this.registerWnd != null) {
      this.registerWnd.close()
      this.registerWnd = null
    }
    if (this.traceWnd != null) {
      this.traceWnd.close()
      this.traceWnd = null
    }
    if (this.ctrlWnd != null) {
      this.ctrlWnd.close()
      this.ctrlWnd = null
    }

    this.wndMgr = null
  }

  private onVblank(leftCycles: number): void {
    if (leftCycles < 1)
      this.render()

    for (let i = 0; i < AudioManager.CHANNEL; ++i) {
      this.audioManager.setChannelFrequency(i, this.nes.apu.getFrequency(i))
      this.audioManager.setChannelVolume(i, this.nes.apu.getVolume(i))
    }
  }

  private onBreakPoint(): void {
    this.updateButtonState()
    this.dumpCpu()
  }

  private startLoopAnimation(): void {
    let lastTime = window.performance.now()
    const loopFn = () => {
      if (this.destroying)
        return

      const curTime = window.performance.now()
      const elapsedTime = curTime - lastTime
      lastTime = curTime

      this.loop(elapsedTime)
      requestAnimationFrame(loopFn)
    }
    requestAnimationFrame(loopFn)
  }

  private loop(elapsedTime: number): void {
    if (this.nes.cpu.isPaused())
      return

    const isFocused = this.screenWnd.isFocused()
    for (let i = 0; i < 2; ++i) {
      let pad = this.padKeyHandler.getStatus(i)
      if (isFocused)
        pad |= this.getGamepadStatus(i)
      this.nes.setPadStatus(i, pad)
    }

    const et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
    let cycles = (CPU_HZ * et / 1000) | 0
    this.nes.runCycles(cycles)
  }

  private render(): void {
    this.wndMgr.update()
  }

  private updateButtonState(): void {
    const paused = this.nes.cpu.isPaused()
    if (this.ctrlWnd != null)
      this.ctrlWnd.updateState(paused)
  }

  private dumpCpu(): void {
    if (this.registerWnd != null)
      this.registerWnd.updateStatus()
    if (this.traceWnd != null)
      this.traceWnd.updateStatus()
  }

  private setUpKeyEvent(root: HTMLElement, padKeyHandler: PadKeyHandler): void {
    root.setAttribute('tabindex', '1')  // To accept key event.
    root.style.outline = 'none'
    root.addEventListener('keydown', (event) => {
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

  private getGamepadStatus(padNo: number): number {
    const THRESHOLD = 0.5

    if (!window.Gamepad)
      return 0
    const gamepads = navigator.getGamepads()
    if (padNo >= gamepads.length)
      return 0

    const gamepad = gamepads[padNo]
    if (!gamepad)
      return 0

    let pad = 0
    if (gamepad.axes[0] < -THRESHOLD)
      pad |= PadBit.L
    if (gamepad.axes[0] > THRESHOLD)
      pad |= PadBit.R
    if (gamepad.axes[1] < -THRESHOLD)
      pad |= PadBit.U
    if (gamepad.axes[1] > THRESHOLD)
      pad |= PadBit.D
    if (gamepad.buttons[0].pressed)
      pad |= PadBit.B
    if (gamepad.buttons[1].pressed)
      pad |= PadBit.A
    if (gamepad.buttons[8].pressed)
      pad |= PadBit.SELECT
    if (gamepad.buttons[9].pressed)
      pad |= PadBit.START
    return pad
  }
}
