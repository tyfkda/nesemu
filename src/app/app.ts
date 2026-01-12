import {Nes, NesEvent} from '../nes/nes'
import {ICartridge, Cartridge} from '../nes/cartridge'
import {Keyboard} from '../nes/peripheral/keyboard'

import {AppEvent} from './app_event'
import {AudioManagerForBrowser} from './audio_manager_for_browser'
import {IDeltaModulationChannel, INoiseChannel, IPulseChannel, WaveType} from '../nes/apu'
import {DomUtil} from '../util/dom_util'
import {Fds} from '../nes/fds/fds'
import {GlobalSetting} from './global_setting'
import {Persistor, PersistToken} from '../util/persist'
import {ScreenWnd} from './screen_wnd'
import {StorageUtil} from '../util/storage_util'
import {Util} from '../util/util'
import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'

import * as Pubsub from '../util/pubsub'

const MAX_ELAPSED_TIME = 1000 / 15

function sramKey(title: string): string {
  return `sram/${title}`
}

export class Option {
  public title?: string
  public centerX?: number
  public centerY?: number
  public x?: number
  public y?: number
  public width?: number
  public height?: number
  public onClosed?: (app: App) => void
  public persistTok?: PersistToken
}

export const enum RomType {
  CARTRIDGE = 'CARTRIDGE',
  DISK = 'DISK',
}

export class App {
  protected destroying = false
  protected isPaused = false
  protected cartridge: ICartridge
  protected audioManager: AudioManagerForBrowser
  protected channelVolumes: Float32Array
  protected stream = new AppEvent.Stream()
  protected subscription: Pubsub.Subscription
  protected persistTok?: PersistToken

  protected prgBanks = new Int32Array([0, 1, -2, -1])
  protected prgBanksLast = new Int32Array([0, 1, -2, -1])

  protected title: string
  protected screenWnd: ScreenWnd

  protected fds?: Fds

  public static create(wndMgr: WindowManager, option: Option, nes: Nes): App {
    return new App(wndMgr, option, nes)
  }

  protected constructor(protected wndMgr: WindowManager, protected option: Option, protected nes: Nes, noDefault?: boolean) {
    const screenWnd = new ScreenWnd(this.wndMgr, this, this.nes, this.stream)
    this.screenWnd = screenWnd
    this.title = option.title || 'NES'
    this.screenWnd.setTitle(this.title)

    this.subscription = this.stream
      .subscribe(this.handleAppEvent.bind(this))

    const size = this.screenWnd.getWindowSize()
    let x: number = -1
    let y: number = -1

    if (option.x !== undefined && option.y !== undefined) {
      x = option.x
      y = option.y
    } else {
      x = Util.clamp((option.centerX || 0) - size.width / 2,
                     0, window.innerWidth - size.width - 1)
      y = Util.clamp((option.centerY || 0) - size.height / 2,
                     0, window.innerHeight - size.height - 1)
    }
    this.screenWnd.setPos(x, y)

    if (option.persistTok !== undefined) {
      this.persistTok = option.persistTok
      this.screenWnd.setPersistTok(this.persistTok)
    }

    if (noDefault)
      return

    window.app = this  // Put app into global.
    this.nes.setEventCallback((event: NesEvent, param?: any) => {
      switch (event) {
      case NesEvent.VBlank:
        this.onVblank(param as number)
        break
      case NesEvent.PrgBankChange:
        {
          const value: number = param
          const bank = (value >> 8) & 3
          const page = value & 0xff
          this.prgBanks[bank] = page
        }
        break
      }
    })
    this.nes.setBreakPointCallback(() => this.onBreakPoint())

    if (GlobalSetting.maximize) {
      this.screenWnd.maximize()
    } else if (option.width !== undefined && option.height !== undefined) {
      this.screenWnd.setClientSize(option.width, option.height)
    } else if (GlobalSetting.clientWidth > 256 && GlobalSetting.clientHeight > 240) {
      this.screenWnd.setClientSize(GlobalSetting.clientWidth, GlobalSetting.clientHeight)
    }
  }

  protected persist(type: RomType, data: Uint8Array): void {
    if (!GlobalSetting.persistCarts)
      return

    if (this.persistTok) {
      if (data.length != 0)
        Persistor.updatePersistRom(this.persistTok, type, data)
    } else {
      const { x, y } = this.screenWnd.getPos()
      const { width, height } = this.screenWnd.getClientSize()
      this.persistTok = Persistor.addPersist(
        type,
        this.title,
        data,
        x,
        y,
        width,
        height,
      )
      this.screenWnd.setPersistTok(this.persistTok)
    }
  }

  public loadRom(romData: Uint8Array): string|null {
    if (!Cartridge.isRomValid(romData))
      return 'Invalid format'

    const cartridge = new Cartridge(romData)
    if (!Nes.isMapperSupported(cartridge.mapperNo))
      return `Mapper ${cartridge.mapperNo} not supported`

    this.cartridge = cartridge
    this.nes.setCartridge(cartridge)

    this.loadSram()

    this.setupAudioManager()

    this.nes.reset()
    this.screenWnd.getContentHolder().focus()

    // Set up keyboard.
    const romHash = cartridge.calcHashValue()
    switch (romHash) {
    case '2ba1dbbb774118eb903465f8e66f92a2':  // Family BASIC v3
    case 'b6fd590c5e833e3ab6b8462e40335842':  // Family BASIC v2.1a
    case 'fc1668b428b5012e61e2de204164f24c':  // Family BASIC v2.0a
      this.screenWnd.setKeyboard(new Keyboard())
      break
    default: break
    }

    this.persist(RomType.CARTRIDGE, romData)

    return null
  }

  public bootDiskBios(biosData: Uint8Array): boolean {
    this.fds = new Fds(biosData, this.nes)
    this.cartridge = this.fds.getCartridge()

    this.setupAudioManager()

    this.nes.reset()
    this.nes.getCpu().pause(false)
    this.screenWnd.getContentHolder().focus()

    this.persist(RomType.DISK, new Uint8Array())

    return true
  }

  public setDiskImage(diskData: Uint8Array): boolean {
    if (this.fds == null)
      return false
    const result = this.fds.setImage(diskData)
    if (result) {
      this.screenWnd.createFdsCtrlWnd(this.fds)
      this.wndMgr.moveToTop(this.screenWnd)
      this.persist(RomType.DISK, diskData)
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

  public async saveDataAs(): Promise<FileSystemFileHandle|null> {
    const paused = this.nes.getCpu().isPaused()
    if (!paused)
      this.stream.triggerPause()
    try {
      const saveData = JSON.stringify(this.nes.save())
      const filename = `${this.title}.sav`
      const fileHandle = await DomUtil.downloadOrSaveToFile(saveData, filename, 'Game status', 'application/json', '.sav')
      if (fileHandle != null)
        this.wndMgr.showSnackbar(`Data saved: ${filename}`, {type: 'success'})
      return fileHandle
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(e)
        this.wndMgr.showSnackbar(`Failed: ${e.toString()}`)
      }
      return null
    } finally {
      if (!paused)
        this.stream.triggerRun()
    }
  }

  public async saveDataTo(fileHandle: FileSystemFileHandle): Promise<void> {
    const paused = this.nes.getCpu().isPaused()
    if (!paused)
      this.stream.triggerPause()
    try {
      const saveData = JSON.stringify(this.nes.save())
      const writable = await fileHandle.createWritable()
      await writable.write(saveData)
      await writable.close()
      this.wndMgr.showSnackbar(`Data saved to: ${fileHandle.name}`, {type: 'success'})
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(e)
        this.wndMgr.showSnackbar(`Failed: ${e.ToString()}`)
      }
    } finally {
      if (!paused)
        this.stream.triggerRun()
    }
  }

  public hasSaveData(): boolean {
    return StorageUtil.hasKey(this.title)
  }

  public loadData(): boolean {
    const saveData = StorageUtil.getObject(this.title, null)
    if (saveData) {
      try {
        this.nes.load(saveData)
        return true
      } catch (e) {
        console.error(e)
        this.wndMgr.showSnackbar('Error: Load data failed')
        return false
      }
    } else {
      this.wndMgr.showSnackbar(`No save data for "${this.title}"`)
      return false
    }
  }

  public async loadDataFromFile(): Promise<FileSystemFileHandle|null> {
    const paused = this.nes.getCpu().isPaused()
    if (!paused)
      this.stream.triggerPause()
    try {
      const opened = await DomUtil.pickOpenFile('.sav', 'Game data', 'application/binary')
      if (opened != null) {
        const binary = await opened.file.arrayBuffer()
        this.loadDataFromBinary(new Uint8Array(binary))
        return opened.fileHandle || null
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(e)
        this.wndMgr.showSnackbar(`Failed: ${e.ToString()}`)
      }
    } finally {
      if (!paused)
        this.stream.triggerRun()
      else
        this.render()
    }
    return null
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
      this.audioManager = new AudioManagerForBrowser()
    } else {
      this.audioManager.releaseAllChannels()
    }
    this.audioManager.setCartridge(this.cartridge)

    const waveTypes = this.nes.getChannelWaveTypes()
    for (const type of waveTypes) {
      this.audioManager.addChannel(type)
    }

    if (this.channelVolumes == null || this.channelVolumes.length !== waveTypes.length) {
      this.channelVolumes = new Float32Array(waveTypes.length)
      this.channelVolumes.fill(1)
    }
  }

  public isTop(): boolean {
    return this.screenWnd.isTop()
  }

  public destroy(): void {
    this.saveSram()
    this.cleanUp()
    if (this.option.onClosed)
      this.option.onClosed(this)
  }

  protected loadSram(): void {
    const sram = StorageUtil.getObject(sramKey(this.title), '')
    if (sram !== '')
      this.nes.loadSram(sram)
  }

  protected saveSram(): void {
    const sram = this.nes.saveSram()
    if (sram == null)
      return
    StorageUtil.putObject(sramKey(this.title), sram)
  }

  protected cleanUp(): void {
    this.destroying = true
    if (this.audioManager)
      this.audioManager.release()

    this.subscription.unsubscribe()

    if (this.persistTok) {
      Persistor.removePersist(this.persistTok)
    }
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
    case AppEvent.Type.ENABLE_AUDIO_CHANNEL:
    case AppEvent.Type.DISABLE_AUDIO_CHANNEL:
      {
        const ch = param as number
        const enable = type === AppEvent.Type.ENABLE_AUDIO_CHANNEL
        this.channelVolumes[ch] = enable ? 1.0 : 0.0
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

    {  // Swap
      const tmp = this.prgBanks
      this.prgBanks = this.prgBanksLast
      this.prgBanksLast = tmp
    }
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

    const et = Math.min(elapsedTime, MAX_ELAPSED_TIME) * GlobalSetting.emulationSpeed * this.screenWnd.getTimeScale()

    this.nes.runMilliseconds(et)
  }

  protected render(): void {
    this.stream.triggerRender()
  }

  protected sendPrgBankChanges(): void {
    for (let bank = 0; bank < 4; ++bank) {
      const page = this.prgBanks[bank]
      if (page !== this.prgBanksLast[bank])
        this.audioManager.onPrgBankChange(bank, page)
    }
  }

  protected updateAudio(): void {
    const audioManager = this.audioManager
    if (audioManager == null)
      return

    this.sendPrgBankChanges()

    const waveTypes = this.nes.getChannelWaveTypes()
    for (let ch = 0; ch < waveTypes.length; ++ch) {
      const channel = this.nes.getSoundChannel(ch)
      const enabled = channel.isEnabled()
      audioManager.setChannelEnable(ch, enabled)
      if (!enabled)
        continue

      const volume = channel.getVolume() * this.channelVolumes[ch]
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
