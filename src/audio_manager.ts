const kTypes = ['square', 'square', 'triangle']

class SoundChannel {
  public gainNode
  public oscillator

  constructor() {
  }

  public create(context: AudioContext, type: string): SoundChannel {
    this.gainNode = context.createGain()
    this.gainNode.gain.value = 0

    this.oscillator = context.createOscillator()
    this.oscillator.type = type
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
  public static CHANNEL = 3

  private context: AudioContext
  private channels: SoundChannel[]

  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)()

    this.channels = kTypes.map(type => {
      const c = new SoundChannel()
      c.create(this.context, type)
        .start()
      return c
    })
  }

  public setChannelFrequency(channel: number, frequency: number): void {
    this.channels[channel].setFrequency(frequency)
  }

  public setChannelVolume(channel: number, volume: number): void {
    this.channels[channel].setVolume(volume)
  }
}
