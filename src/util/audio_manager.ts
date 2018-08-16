const kChannelTypes: (OscillatorType | 'noise')[] = ['square', 'square', 'triangle', 'noise']

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

  public create(context: AudioContext, type: (OscillatorType | 'noise')): void {
    this.gainNode = context.createGain()
    this.gainNode.gain.setTargetAtTime(0, context.currentTime, 0)

    this.oscillator = context.createOscillator()
    if (type !== 'noise') {
      this.oscillator.type = type
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
  public static CHANNEL_COUNT = kChannelTypes.length

  private static initialized: boolean = false
  private static context?: AudioContext

  private channels: SoundChannel[]
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
    const context = AudioManager.context
    if (context == null)
      return

    this.masterVolume = 1.0
    this.channels = kChannelTypes.map(type => {
      const sc = new SoundChannel()
      sc.create(context, type)
      sc.start()
      return sc
    })
  }

  public destroy() {
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
