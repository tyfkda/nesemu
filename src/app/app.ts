import {Nes} from '../nes/nes'

import {AppEvent} from './app_event'
import {AudioManager} from '../util/audio_manager'
import {IDeltaModulationChannel, INoiseChannel, IPulseChannel, WaveType} from '../nes/apu'
import {DomUtil} from '../util/dom_util'
import {Fds} from '../nes/fds/fds'
import {ScreenWnd} from './screen_wnd'
import {StorageUtil} from '../util/storage_util'
import {Util} from '../util/util'
import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'

import * as Pubsub from '../util/pubsub'

const MAX_ELAPSED_TIME = 1000 / 15

export class Option {
  public title?: string
  public centerX?: number
  public centerY?: number
  public onClosed?: (app: App) => void
}

export class App {
  protected destroying = false
  protected isPaused = false
  protected nes: Nes
  protected audioManager: AudioManager
  protected stream = new AppEvent.Stream()
  protected subscription: Pubsub.Subscription

  protected title: string
  protected screenWnd: ScreenWnd

  protected fds?: Fds

  public static create(wndMgr: WindowManager, option: Option): App {
    return new App(wndMgr, option)
  }

  constructor(protected wndMgr: WindowManager, protected option: Option, noDefault?: boolean) {
    if (noDefault)
      return

    this.nes = Nes.create()
    window.app = this  // Put app into global.
    this.nes.setVblankCallback(leftV => this.onVblank(leftV))
    this.nes.setBreakPointCallback(() => this.onBreakPoint())

    this.subscription = this.stream
      .subscribe(this.handleAppEvent.bind(this))

    const screenWnd = new ScreenWnd(this.wndMgr, this, this.nes, this.stream)
    this.screenWnd = screenWnd
    this.title = option.title || 'NES'
    this.screenWnd.setTitle(this.title)

    const size = this.screenWnd.getWindowSize()
    const x = Util.clamp((option.centerX || 0) - size.width / 2,
                         0, window.innerWidth - size.width - 1)
    const y = Util.clamp((option.centerY || 0) - size.height / 2,
                         0, window.innerHeight - size.height - 1)
    this.screenWnd.setPos(x, y)
  }

  public loadRom(romData: Uint8Array): boolean | string {
    const result = this.nes.setRomData(romData)
    if (result !== true)
      return result

    this.setupAudioManager()

    this.nes.reset()
    this.screenWnd.getContentHolder().focus()

    return true
  }

  public bootDiskBios(biosData: Uint8Array): boolean {
    this.fds = new Fds(biosData, this.nes)

    this.setupAudioManager()

    this.nes.reset()
    this.nes.getCpu().pause(false)
    this.screenWnd.getContentHolder().focus()

    return true
  }

  public setDiskImage(diskData: Uint8Array): boolean {
    if (this.fds == null)
      return false
    const result = this.fds.setImage(diskData)
    if (result) {
      this.screenWnd.createFdsCtrlWnd(this.fds)
      this.wndMgr.moveToTop(this.screenWnd)
    }
    return result
  }

  public close(): void {
    this.screenWnd.close()
  }

  public saveData(): boolean {
    const saveData = this.nes.save()
    return StorageUtil.putObject(this.title, saveData)
  }

  public saveDataAs(): void {
    const saveData = this.nes.save()
    const blob = new Blob([JSON.stringify(saveData)], {type: 'application/json'})
    const objectURL = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    document.body.appendChild(link)
    link.href = objectURL
    link.download = `${this.title}.sav`
    link.click()
    document.body.removeChild(link)
  }

  public hasSaveData(): boolean {
    return StorageUtil.hasKey(this.title)
  }

  public loadData(): any {
    const saveData = StorageUtil.getObject(this.title, null)
    if (saveData) {
      try {
        this.nes.load(saveData)
      } catch (e) {
        console.error(e)
        this.wndMgr.showSnackbar('Error: Load data failed')
      }
    } else {
      this.wndMgr.showSnackbar(`No save data for "${this.title}"`)
    }
  }

  public loadDataFromFile(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.sav, application/json'
    input.onchange = _event => {
      if (!input.value)
        return
      const fileList = input.files
      if (fileList) {
        const file = fileList[0]
        DomUtil.loadFile(file)
          .then(binary => this.loadDataFromBinary(binary))
      }
      input.value = ''
    }
    input.click()
  }

  public loadDataFromBinary(binary: Uint8Array): void {
    try {
      const json = new TextDecoder().decode(binary)
      const saveData = JSON.parse(json)
      this.nes.load(saveData)
    } catch (e) {
      console.error(e)
      this.wndMgr.showSnackbar('Error: Load data failed')
    }
  }

  public setupAudioManager(): void {
    if (this.audioManager == null) {
      const bus = this.nes.getBus()
      this.audioManager = new AudioManager(bus.read8.bind(bus))
    } else {
      this.audioManager.releaseAllChannels()
    }

    const waveTypes = this.nes.getChannelWaveTypes()
    for (const type of waveTypes) {
      this.audioManager.addChannel(type)
    }
  }

  public toggleAudioBlockiness(): void {
    this.audioManager.toggleBlockiness()
  }

  public getAudioBlockiness(): boolean {
    return this.audioManager.getBlockiness()
  }

  public isTop(): boolean {
    return this.screenWnd.isTop()
  }

  protected destroy(): void {
    this.cleanUp()
    if (this.option.onClosed)
      this.option.onClosed(this)
  }

  protected cleanUp(): void {
    this.destroying = true
    if (this.audioManager)
      this.audioManager.release()

    this.subscription.unsubscribe()
  }

  protected handleAppEvent(type: AppEvent.Type, param?: any): void {
    switch (type) {
    case AppEvent.Type.UPDATE:
      if (!this.isPaused) {
        const elapsed = param as number
        this.update(elapsed)
      }
      break
    case AppEvent.Type.RUN:
      this.nes.getCpu().pause(false)
      break
    case AppEvent.Type.PAUSE:
      this.nes.getCpu().pause(true)
      this.muteAudio()
      break
    case AppEvent.Type.STEP:
      this.nes.runMilliseconds(0)
      break
    case AppEvent.Type.RESET:
      this.nes.reset()
      break
    case AppEvent.Type.PAUSE_APP:
      this.isPaused = true
      this.muteAudio()
      break
    case AppEvent.Type.RESUME_APP:
      this.isPaused = false
      break
    case AppEvent.Type.CLOSE_WND:
      {
        const wnd = param as Wnd
        if (wnd === this.screenWnd)
          this.destroy()
      }
      break
    default:
      break
    }
  }

  protected onVblank(leftV: number): void {
    if (leftV < 1)
      this.render()
    this.updateAudio()
  }

  protected onBreakPoint(): void {
    this.stream.triggerBreakPoint()
  }

  protected update(elapsedTime: number): void {
    if (this.nes.getCpu().isPaused())
      return

    for (let i = 0; i < 2; ++i) {
      const pad = this.screenWnd.getPadStatus(i)
      this.nes.setPadStatus(i, pad)
    }

    const et = Math.min(elapsedTime, MAX_ELAPSED_TIME) * this.screenWnd.getTimeScale()

    this.nes.runMilliseconds(et)
  }

  protected render(): void {
    this.stream.triggerRender()
  }

  protected updateAudio(): void {
    const audioManager = this.audioManager
    if (audioManager == null)
      return

    const waveTypes = this.nes.getChannelWaveTypes()
    for (let ch = 0; ch < waveTypes.length; ++ch) {
      const channel = this.nes.getSoundChannel(ch)
      const enabled = channel.isEnabled()
      audioManager.setChannelEnable(ch, enabled)
      if (!enabled)
        continue

      const volume = channel.getVolume()
      audioManager.setChannelVolume(ch, volume)
      if (volume > 0) {
        switch (waveTypes[ch]) {
        case WaveType.PULSE:
          {
            const pulse = channel as unknown as IPulseChannel
            audioManager.setChannelDutyRatio(ch, pulse.getDutyRatio())
          }
          // Fallthrough
        case WaveType.TRIANGLE:
        case WaveType.SAWTOOTH:
          audioManager.setChannelFrequency(ch, channel.getFrequency())
          break
        case WaveType.NOISE:
          {
            const noise = channel as unknown as INoiseChannel
            const [period, mode] = noise.getNoisePeriod()
            audioManager.setChannelPeriod(ch, period, mode)
          }
          break
        case WaveType.DMC:
          {
            const dmc = channel as unknown as IDeltaModulationChannel
            audioManager.setChannelDmcWrite(ch, dmc.getWriteBuf())
          }
          break
        }
      }
    }
  }

  protected muteAudio(): void {
    this.audioManager.muteAll()
  }
}
