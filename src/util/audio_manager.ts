import {WaveType} from '../nes/apu'
import {SoundChannel, PulseChannel, TriangleChannel, SawtoothChannel} from './audio/sound_channel'
import {IDmcChannel, INoiseChannel} from './audio/sound_channel'
import {ICartridge} from '../nes/cartridge'

const GLOBAL_MASTER_VOLUME = 0.5

export abstract class AudioManager {
  protected static initialized = false
  protected static audioContextClass?: AudioContext
  protected static context?: AudioContext
  protected static masterGainNode: GainNode
  protected static masterVolume = 1.0

  protected channels = new Array<SoundChannel>()
  protected dmcChannelIndex = -1
  protected cartridge: ICartridge

  public static setUp(audioContextClass: any): void {
    if (AudioManager.initialized)
      return

    if (audioContextClass == null)
      return
    AudioManager.audioContextClass = audioContextClass
    AudioManager.initialized = true
  }

  public static enableAudio(): void {
    if (AudioManager.context != null)
      return
    const audioContextClass: any = AudioManager.audioContextClass
    if (audioContextClass != null) {
      const context = new audioContextClass() as AudioContext
      AudioManager.context = context
      AudioManager.masterGainNode = context.createGain()
      AudioManager.masterGainNode.gain.setValueAtTime(
        AudioManager.masterVolume * GLOBAL_MASTER_VOLUME, context.currentTime)
      AudioManager.masterGainNode.connect(context.destination)
    }
  }

  public static getContext(): AudioContext|undefined { return this.context }

  public static setMasterVolume(volume: number): void {
    AudioManager.checkSetUpCalled()
    AudioManager.masterVolume = volume

    const context = AudioManager.context
    if (context)
      AudioManager.masterGainNode.gain.setValueAtTime(volume * GLOBAL_MASTER_VOLUME, context.currentTime)
  }

  private static checkSetUpCalled(): void {
    if (!AudioManager.initialized) {
      console.error('Audio.setUp must be called!')
    }
  }

  abstract createNoiseChannel(context: AudioContext, destination: AudioNode): INoiseChannel
  abstract createDmcChannel(context: AudioContext, destination: AudioNode): IDmcChannel

  constructor() {
    AudioManager.checkSetUpCalled()
  }

  public release(): void {
    this.releaseAllChannels()
    // this.cartridge = null
  }

  public releaseAllChannels(): void {
    if (this.channels != null) {
      for (const channel of this.channels) {
        channel.destroy()
      }
      this.channels.length = 0
    }
  }

  public setCartridge(cartridge: ICartridge): void {
    this.cartridge = cartridge
  }

  public addChannel(type: WaveType): void {
    const context = AudioManager.context
    if (context == null)
      return

    let sc: SoundChannel

    const destination = AudioManager.masterGainNode
    switch (type) {
    case WaveType.PULSE:
      sc = new PulseChannel(context, destination)
      break
    case WaveType.TRIANGLE:
      sc = new TriangleChannel(context, destination)
      break
    case WaveType.NOISE:
      sc = this.createNoiseChannel(context, destination)
      break
    case WaveType.SAWTOOTH:
      sc = new SawtoothChannel(context, destination)
      break
    case WaveType.DMC:
      {
        this.dmcChannelIndex = this.channels.length

        const dmc = this.createDmcChannel(context, destination)
        sc = dmc

        if (this.cartridge != null)
          dmc.setCartridge(this.cartridge)
      }
      break
    }

    sc.start()
    this.channels.push(sc)
  }

  public setChannelEnable(channel: number, enable: boolean): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setEnable(enable)
  }

  public setChannelFrequency(channel: number, frequency: number): void {
    if (AudioManager.context == null)
      return

    frequency = Math.min(frequency, AudioManager.context.sampleRate * 0.5)
    this.channels[channel].setFrequency(frequency)
  }

  public setChannelVolume(channel: number, volume: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setVolume(volume)
  }

  public setChannelDutyRatio(channel: number, dutyRatio: number): void {
    if (AudioManager.context == null)
      return
    (this.channels[channel] as PulseChannel).setDutyRatio(dutyRatio)
  }

  public setChannelPeriod(channel: number, period: number, mode: number): void {
    if (AudioManager.context == null)
      return
    (this.channels[channel] as INoiseChannel).setNoisePeriod(period, mode)
  }

  public setChannelDmcWrite(channel: number, buf: ReadonlyArray<number>): void {
    if (AudioManager.context == null)
      return
    const dmc = this.channels[channel] as IDmcChannel
    for (let i = 0; i < buf.length; ++i) {
      const d = buf[i]
      const r = d >> 8
      const v = d & 0xff
      dmc.setDmcWrite(r, v)
    }
  }

  public muteAll(): void {
    const n = this.channels.length
    for (let ch = 0; ch < n; ++ch)
      this.setChannelVolume(ch, 0)
  }

  public onPrgBankChange(bank: number, page: number) {
    if (this.dmcChannelIndex < 0)
      return
    const dmc = this.channels[this.dmcChannelIndex] as IDmcChannel
    dmc.changePrgBank(bank, page)
  }
}
