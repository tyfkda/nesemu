const kTypes = ['square', 'square', 'triangle', 'noise']

class SoundChannel {
  public gainNode
  public oscillator

  constructor() {
  }

  public destroy() {
    if (this.gainNode != null) {
      this.gainNode.disconnect()
      this.gainNode = null
    }
    if (this.oscillator != null) {
      this.oscillator.disconnect()
      this.oscillator = null
    }
  }

  public create(context: AudioContext, type: string): SoundChannel {
    this.gainNode = context.createGain()
    this.gainNode.gain.value = 0

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
    return this
  }

  public start(): SoundChannel {
    this.oscillator.start()
    return this
  }

  public setFrequency(frequency: number) {
    this.oscillator.frequency.setValueAtTime(frequency, 0)
  }

  public setVolume(volume: number) {
    this.gainNode.gain.value = volume
  }
}

export class AudioManager {
  public static CHANNEL = 4

  private context: AudioContext
  private channels: SoundChannel[]
  private masterVolume: number

  constructor() {
    const contextClass = window.AudioContext || window.webkitAudioContext
    if (contextClass == null) {
      this.context = null
      this.masterVolume = 0
      return
    }

    this.context = new contextClass()
    if (this.context.close == null) {  // Patch for MSEdge, which doesn't have close method.
      this.context.close = () => {}
    }
    this.masterVolume = 1.0

    this.channels = kTypes.map(type => {
      const c = new SoundChannel()
      c.create(this.context, type)
        .start()
      return c
    })
  }

  public destroy() {
    if (this.context == null)
      return

    for (let channel of this.channels) {
      channel.destroy()
    }
    this.context.close()
    this.context = null
  }

  public setChannelFrequency(channel: number, frequency: number): void {
    if (this.context == null)
      return
    this.channels[channel].setFrequency(frequency)
  }

  public setChannelVolume(channel: number, volume: number): void {
    if (this.context == null)
      return
    this.channels[channel].setVolume(volume * this.masterVolume)
  }

  public setMasterVolume(volume: number): void {
    if (this.context == null)
      return
    this.masterVolume = volume
    if (volume <= 0) {
      this.channels.forEach(channel => {
        channel.setVolume(0)
      })
    }
  }
}
