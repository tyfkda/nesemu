import {Nes} from '../nes/nes.ts'

import {AudioManager} from './audio_manager.ts'
import {PadKeyHandler} from './pad_key_handler.ts'
import {ScreenWnd, PaletWnd, NameTableWnd, PatternTableWnd,
        RegisterWnd, TraceWnd, ControlWnd} from './ui.ts'

import WindowManager from '../wnd/window_manager.ts'

const CPU_HZ = 1789773
const MAX_ELAPSED_TIME = 1000 / 20

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

  public static create(wndMgr: WindowManager, root: HTMLElement, title: string): App {
    return new App(wndMgr, root, title)
  }

  constructor(private wndMgr: WindowManager, private root: HTMLElement, title: string) {
    this.nes = Nes.create()
    window.nes = this.nes  // Put nes into global.
    this.nes.setVblankCallback((leftCycles) => { this.onVblank(leftCycles) })
    this.nes.setBreakPointCallback(() => { this.onBreakPoint() })

    this.audioManager = new AudioManager()
    this.audioManager.setMasterVolume(0)

    this.screenWnd = new ScreenWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.screenWnd)
    this.screenWnd.setPos(0, 0)
    this.screenWnd.setTitle(title)
    this.screenWnd.setCallback((action, ...params) => {
      switch (action) {
      case 'close':
        this.cleanUp()
        break
      default:
        break
      }
    })

    this.paletWnd = new PaletWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.paletWnd)
    this.paletWnd.setPos(520, 0)

    this.nameTableWnd = new NameTableWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.nameTableWnd)
    this.nameTableWnd.setPos(520, 40)

    this.patternTableWnd = new PatternTableWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.patternTableWnd)
    this.patternTableWnd.setPos(520, 300)

    this.traceWnd = new TraceWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.traceWnd)
    this.traceWnd.setPos(0, 500)

    this.registerWnd = new RegisterWnd(this.wndMgr, this.nes)
    this.wndMgr.add(this.registerWnd)
    this.registerWnd.setPos(410, 500)

    this.ctrlWnd = new ControlWnd(this.wndMgr, this.nes, this.screenWnd, this.audioManager)
    this.ctrlWnd.setCallback((action) => {
      switch (action) {
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
    this.traceWnd.reset()
    this.dumpCpu()
    this.updateButtonState()
    this.root.focus()
    return true
  }

  private cleanUp() {
    this.destroying = true
    this.audioManager.destroy()

    this.paletWnd.close()
    this.nameTableWnd.close()
    this.patternTableWnd.close()
    this.registerWnd.close()
    this.traceWnd.close()
    this.ctrlWnd.close()
    this.paletWnd = null
    this.nameTableWnd = null
    this.patternTableWnd = null
    this.registerWnd = null
    this.traceWnd = null
    this.ctrlWnd = null

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

    for (let i = 0; i < 2; ++i)
      this.nes.setPadStatus(i, this.padKeyHandler.getStatus(i))

    const et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
    let cycles = (CPU_HZ * et / 1000) | 0
    this.nes.runCycles(cycles)
  }

  private render(): void {
    this.wndMgr.update()
  }

  private updateButtonState(): void {
    const paused = this.nes.cpu.isPaused()
    this.ctrlWnd.updateState(paused)
  }

  private dumpCpu(): void {
    this.registerWnd.updateStatus()
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
}
