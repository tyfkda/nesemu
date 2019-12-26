import {ChannelType} from '../nes/apu'

abstract class SoundChannel {
  protected gainNode: GainNode

  public destroy() {
    if (this.gainNode != null) {
      this.gainNode.disconnect()
      // this.gainNode = null
    }
  }

  public constructor(context: AudioContext) {
    this.gainNode = context.createGain()
    this.gainNode.gain.setValueAtTime(0, context.currentTime)
  }

  public start(): void {
  }

  public setVolume(volume: number, context: AudioContext) {
    this.gainNode.gain.setValueAtTime(volume, context.currentTime)
  }

  public setFrequency(_frequency: number) {
  }

  public setDutyRatio(_ratio: number) {
  }
}

abstract class OscillatorChannel extends SoundChannel {
  protected oscillator: OscillatorNode

  public destroy() {
    super.destroy()
    if (this.oscillator != null) {
      this.oscillator.disconnect()
      // this.oscillator = null
    }
  }

  public constructor(context: AudioContext, destination: AudioNode) {
    super(context)

    this.oscillator = context.createOscillator()
    this.setupOscillator(this.oscillator, context, destination)
  }

  public start(): void {
    this.oscillator.start()
  }

  public setFrequency(frequency: number) {
    const now = this.gainNode.context.currentTime
    this.oscillator.frequency.setValueAtTime(frequency, now)
  }

  protected abstract setupOscillator(oscillator: OscillatorNode, context: AudioContext,
                                     destination: AudioNode)
}

class TriangleChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, _context: AudioContext,
                            destination: AudioNode) {
    oscillator.type = 'triangle'
    oscillator.connect(this.gainNode)
    this.gainNode.connect(destination)
  }
}

class SawtoothChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, _context: AudioContext,
                            destination: AudioNode) {
    oscillator.type = 'sawtooth'
    oscillator.connect(this.gainNode)
    this.gainNode.connect(destination)
  }
}

class NoiseChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, context: AudioContext,
                            destination: AudioNode) {
    const count = 1024
    const real = new Float32Array(count)
    const imag = new Float32Array(count)
    real[0] = imag[0] = 0  // DC
    for (let i = 1; i < count; ++i) {
      const t = Math.random() * (2 * Math.PI)
      real[i] = Math.cos(t)
      imag[i] = Math.sin(t)
    }
    const wave = context.createPeriodicWave(real, imag)
    oscillator.setPeriodicWave(wave)

    oscillator.connect(this.gainNode)
    this.gainNode.connect(destination)
  }
}

// Pulse with duty control.
class PulseChannel extends OscillatorChannel {
  private delay: DelayNode
  private frequency: number = 1
  private duty: number = 0.5

  public destroy() {
    super.destroy()
    if (this.delay != null) {
      this.delay.disconnect()
      // this.delay = null
    }
  }

  public setFrequency(frequency: number) {
    if (this.frequency === frequency)
      return
    this.frequency = frequency
    super.setFrequency(frequency)

    this.updateDelay()
  }

  public setDutyRatio(ratio: number) {
    if (this.duty === ratio)
      return
    this.duty = ratio
    this.updateDelay()
  }

  protected setupOscillator(oscillator: OscillatorNode, context: AudioContext,
                            destination: AudioNode) {
    oscillator.type = 'sawtooth'

    const inverter = context.createGain()
    inverter.gain.value = -1
    oscillator.connect(inverter)
    inverter.connect(this.gainNode)

    const delay = context.createDelay()
    oscillator.connect(delay)
    delay.connect(this.gainNode)
    this.delay = delay

    this.gainNode.connect(destination)
  }

  private updateDelay() {
    const now = this.delay.context.currentTime
    this.delay.delayTime.setValueAtTime((1.0 - this.duty) / this.frequency, now)
  }
}

class DmcChannel extends OscillatorChannel {
  protected setupOscillator(_oscillator: OscillatorNode, _context: AudioContext,
                            _destination: AudioNode) {
    // TODO: Implement
  }
}

function createSoundChannel(
    context: AudioContext, destination: AudioNode, type: ChannelType,
): SoundChannel {
  switch (type) {
  case ChannelType.PULSE:
    return new PulseChannel(context, destination)
  case ChannelType.TRIANGLE:
    return new TriangleChannel(context, destination)
  case ChannelType.NOISE:
    return new NoiseChannel(context, destination)
  case ChannelType.SAWTOOTH:
    return new SawtoothChannel(context, destination)
  case ChannelType.DMC:
    return new DmcChannel(context, destination)
  }
}

export default class AudioManager {
  private static initialized: boolean = false
  private static context?: AudioContext
  private static masterGainNode: GainNode

  private channels = new Array<SoundChannel>()

  public static setUp(audioContextClass: any) {
    if (AudioManager.initialized)
      return

    if (audioContextClass == null)
      return
    AudioManager.context = new audioContextClass() as AudioContext
    AudioManager.masterGainNode = AudioManager.context.createGain()
    AudioManager.masterGainNode.gain.setValueAtTime(1, AudioManager.context.currentTime)
    AudioManager.masterGainNode.connect(AudioManager.context.destination)
    AudioManager.initialized = true
  }

  public static setMasterVolume(volume: number): void {
    AudioManager.checkSetUpCalled()

    const context = AudioManager.context
    if (context)
      AudioManager.masterGainNode.gain.setValueAtTime(volume, context.currentTime)
  }

  private static checkSetUpCalled() {
    if (!AudioManager.initialized) {
      console.error('Audio.setUp must be called!')
    }
  }

  constructor() {
    AudioManager.checkSetUpCalled()
  }

  public addChannel(type: ChannelType) {
    const context = AudioManager.context
    if (context == null)
      return

    const sc = createSoundChannel(context, AudioManager.masterGainNode, type)
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
    this.channels[channel].setVolume(volume, AudioManager.context)
  }

  public setChannelDutyRatio(channel: number, ratio: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setDutyRatio(ratio)
  }
}
