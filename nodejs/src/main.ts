const fs = __non_webpack_require__('fs').promises

import JSZip from 'jszip'
import {Nes, NesEvent} from '../../src/nes/nes'
import {Cartridge} from '../../src/nes/cartridge'
import {IDeltaModulationChannel, INoiseChannel, IPulseChannel, PadValue, WaveType} from '../../src/nes/apu'
import {Util} from '../../src/util/util'
import {AudioManager} from '../../src/util/audio_manager'

import {AudioContext} from './audio_context'

const sdl = __non_webpack_require__('@kmamal/sdl')

const DEFAULT_MASTER_VOLUME = 0.25

const KEY_X = 27
const KEY_Z = 29
const ARROW_RIGHT = 79
const ARROW_LEFT = 80
const ARROW_DOWN = 81
const ARROW_UP = 82
const RETURN = 40
const ESCAPE = 41
const SPACE = 44

const kScanCode2PadValue: Record<number, number> = {
  [ARROW_RIGHT]: PadValue.R,
  [ARROW_LEFT]: PadValue.L,
  [ARROW_DOWN]: PadValue.D,
  [ARROW_UP]: PadValue.U,
  [KEY_X]: PadValue.A,
  [KEY_Z]: PadValue.B,
  [RETURN]: PadValue.START,
  [SPACE]: PadValue.SELECT,
}

const WIDTH = 256
const HEIGHT = 240
const HEDGE = 4 | 0
const VEDGE = 8 | 0

const TITLE = 'Nesemu'

const MAX_ELAPSED_TIME = 1000 / 15

class MyApp {
  private win: any
  private pixels = new Uint8Array(WIDTH * HEIGHT * 4)
  private buffer: Buffer
  private u8buffer: Uint8Array
  private prevTime = 0

  protected cartridge: Cartridge
  private nes: Nes
  private pad = 0
  private timer: NodeJS.Timer | undefined

  private audioManager = new AudioManager()

  protected prgBanks = new Int32Array([0, 1, -2, -1])
  protected prgBanksLast = new Int32Array([0, 1, -2, -1])

  static async loadRom(app: MyApp, fileName: string): Promise<void> {
    try {
      const romData = await loadNesRomData(fileName)
      if (romData != null)
        app.run(romData)
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  }

  constructor() {
    this.buffer = Buffer.alloc(0)  // Dummy
    this.u8buffer = new Uint8Array(this.buffer.buffer)

    this.win = sdl.video.createWindow({
      width: (WIDTH - HEDGE * 2) * 3,
      height: (HEIGHT - VEDGE * 2) * 3,
      title: TITLE,
      resizable: true,
      vsync: true,
    })
    this.win.on('close', () => {
      clearInterval(this.timer)
    })
    this.win.on('keyDown', (key) => {
      if (key.scancode === ESCAPE)
        process.exit(0)

      const v = kScanCode2PadValue[key.scancode]
      if (v)
        this.pad |= v
    })
    this.win.on('keyUp', (key) => {
      const v = kScanCode2PadValue[key.scancode]
      if (v)
        this.pad &= ~v
    })
    this.win.on('resize', ({width, height}) => {
      this.buffer = Buffer.alloc(width * 4 * height)
      this.u8buffer = new Uint8Array(this.buffer.buffer)
    })
    this.win.on('dropFile', (({file}) => {
      this.release()

      MyApp.loadRom(this, file)
    }))
  }

  public run(romData: Uint8Array): void {
    this.nes = new Nes()

    if (!Cartridge.isRomValid(romData))
      throw 'Invalid format'

    const cartridge = new Cartridge(romData)
    if (!Nes.isMapperSupported(cartridge.mapperNo))
      throw `Mapper ${cartridge.mapperNo} not supported`

    this.cartridge = cartridge
    this.nes.setCartridge(cartridge)
    this.nes.reset()

    this.setupAudioManager()
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
      default: break
      }
    })

    this.prevTime = performance.now()
    this.timer = setInterval(() => {
      const now = performance.now()
      const elapsedTime = now - this.prevTime
      this.loop(elapsedTime)
      this.prevTime = now
    }, 1000 / 100)
  }

  private release(): void {
    if (this.timer != null) {
      clearInterval(this.timer)
      delete this.timer
    }
    this.teardownAudioManager()
  }

  private loop(elapsedTime: number): void {
    this.nes.setPadStatus(0, this.pad)

    let et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
    this.nes.runMilliseconds(et)
  }

  private onVblank(leftV: number): void {
    if (leftV < 1)
      this.render()
    this.updateAudio()

    {  // Swap
      const tmp = this.prgBanks
      this.prgBanks = this.prgBanksLast
      this.prgBanksLast = tmp
    }
  }

  private render(): void {
    this.nes.render(this.pixels)

    const {width, height} = this.win
    const u8buf = this.u8buffer
    const SHIFT = 12
    const stepX = (((WIDTH - HEDGE * 2) << SHIFT) / width) | 0
    const stepY = (((HEIGHT - VEDGE * 2) << SHIFT) / height) | 0
    let dst = 0
    let sy = VEDGE << SHIFT
    for (let i = 0; i < height; ++i, sy += stepY) {
      let sx = HEDGE << SHIFT
      for (let j = 0; j < width; ++j, sx += stepX) {
        const src = ((sy >> SHIFT) * WIDTH + (sx >> SHIFT)) * 4
        u8buf[dst++] = this.pixels[src]
        u8buf[dst++] = this.pixels[src + 1]
        u8buf[dst++] = this.pixels[src + 2]
        u8buf[dst++] = 255
      }
    }
    this.win.render(width, height, width * 4, 'rgba32', this.buffer)
  }

  private setupAudioManager(): void {
    this.audioManager.setCartridge(this.cartridge)

    const waveTypes = this.nes.getChannelWaveTypes()
    for (const type of waveTypes) {
      this.audioManager.addChannel(type)
    }
  }

  private teardownAudioManager(): void {
    this.audioManager.release()
  }

  private updateAudio(): void {
    const audioManager = this.audioManager

    this.sendPrgBankChanges()

    const nes = this.nes
    const waveTypes = this.nes.getChannelWaveTypes()
    for (let ch = 0; ch < waveTypes.length; ++ch) {
      const channel = nes.getSoundChannel(ch)
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

    AudioManager.getContext()?.update(1.0 / 60)
  }

  private sendPrgBankChanges(): void {
    for (let bank = 0; bank < 4; ++bank) {
      const page = this.prgBanks[bank]
      if (page !== this.prgBanksLast[bank])
        this.audioManager.onPrgBankChange(bank, page)
    }
  }
}

async function loadNesRomData(fileName: string): Promise<Uint8Array> {
  switch (Util.getExt(fileName).toLowerCase()) {
  case 'nes':
    return await fs.readFile(fileName)

  case 'zip':
    {
      const data = await fs.readFile(fileName)
      const zip = new JSZip()
      const loadedZip = await zip.loadAsync(data)
      for (let fn of Object.keys(loadedZip.files)) {
        if (Util.getExt(fn).toLowerCase() === 'nes')
          return loadedZip.files[fn].async('uint8array')
      }
      return Promise.reject(`No .nes file included in ${fileName}`)
    }

  default:
    return Promise.reject('.nes or .zip file required')
  }
}

AudioManager.setUp(AudioContext)
AudioManager.setMasterVolume(DEFAULT_MASTER_VOLUME)
AudioManager.enableAudio()

const myApp = new MyApp()
if (process.argv.length > 2)
  MyApp.loadRom(myApp, process.argv[2])
