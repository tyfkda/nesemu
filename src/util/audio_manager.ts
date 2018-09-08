import {ChannelType} from '../nes/apu'

const kOscillatorTypes: OscillatorType[] = ['square', 'triangle', 'sawtooth']

class SoundChannel {
  private gainNode: GainNode
  private oscillator: OscillatorNode

  public destroy() {
    if (this.gainNode != null) {
      this.gainNode.disconnect()
      // this.gainNode = null
    }
    if (this.oscillator != null) {
      this.oscillator.disconnect()
      // this.oscillator = null
    }
  }

  public create(context: AudioContext, type: ChannelType): void {
    this.gainNode = context.createGain()
    this.gainNode.gain.setTargetAtTime(0, context.currentTime, 0)

    this.oscillator = context.createOscillator()
    if (type !== ChannelType.NOISE) {
      this.oscillator.type = kOscillatorTypes[type]
    } else {
      const count = 1024
      const real = new Float32Array(count)
      const imag = new Float32Array(count)
      for (let i = 0; i < count; ++i) {
        real[i] = Math.random() * 2 - 1
        imag[i] = 0
      }
      const wave = context.createPeriodicWave(real, imag)
      this.oscillator.setPeriodicWave(wave)
    }
    this.oscillator.connect(this.gainNode)
    this.gainNode.connect(context.destination)
  }

  public start(): void {
    this.oscillator.start()
  }

  public setFrequency(frequency: number) {
    const now = this.gainNode.context.currentTime
    this.oscillator.frequency.setValueAtTime(frequency, now)
  }

  public setVolume(volume: number, context: AudioContext) {
    this.gainNode.gain.setTargetAtTime(volume, context.currentTime, 0)
  }
}

export class AudioManager {
  private static initialized: boolean = false
  private static context?: AudioContext

  private channels = new Array<SoundChannel>()
  private masterVolume: number = 0

  private static setUp() {
    if (AudioManager.initialized)
      return
    AudioManager.initialized = true

    const contextClass = window.AudioContext || window.webkitAudioContext
    if (contextClass == null)
      return
    AudioManager.context = new contextClass()
  }

  constructor() {
    AudioManager.setUp()

    this.masterVolume = 1.0
  }

  public addChannel(type: ChannelType) {
    const context = AudioManager.context
    if (context == null)
      return

    const sc = new SoundChannel()
    sc.create(context, type)
    sc.start()
    this.channels.push(sc)
  }

  public getChannelCount(): number {
    return this.channels.length
  }

  public release() {
    if (this.channels != null) {
      for (let channel of this.channels) {
        channel.destroy()
      }
      this.channels.length = 0
    }
  }

  public setChannelFrequency(channel: number, frequency: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setFrequency(frequency)
  }

  public setChannelVolume(channel: number, volume: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setVolume(volume * this.masterVolume, AudioManager.context)
  }

  public setMasterVolume(volume: number): void {
    const context = AudioManager.context
    if (context == null)
      return
    this.masterVolume = volume
    if (volume <= 0) {
      this.channels.forEach(channel => {
        channel.setVolume(0, context)
      })
    }
  }
}
