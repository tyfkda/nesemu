import {WaveType} from '../nes/apu'
import {NoiseSampler} from './apu_util'

abstract class SoundChannel {
  public abstract destroy(): void
  public abstract setVolume(_volume: number): void
  public abstract start(): void

  public setFrequency(_frequency: number): void { throw new Error('Invalid call') }
  public setDutyRatio(_dutyRatio: number): void { throw new Error('Invalid call') }
  public setNoisePeriod(_period: number, _mode: number): void { throw new Error('Invalid call') }
}

abstract class GainSoundChannel extends SoundChannel {
  protected gainNode: GainNode
  protected volume = 1

  public constructor(context: AudioContext) {
    super()
    this.gainNode = context.createGain()
    this.gainNode.gain.setValueAtTime(0, context.currentTime)
  }

  public destroy(): void {
    if (this.gainNode != null) {
      this.gainNode.disconnect()
      // this.gainNode = null
    }
  }

  public setVolume(volume: number): void {
    if (volume === this.volume)
      return
    this.volume = volume

    this.gainNode.gain.setValueAtTime(volume, this.gainNode.context.currentTime)
  }
}

abstract class OscillatorChannel extends GainSoundChannel {
  protected oscillator: OscillatorNode
  protected frequency = 1

  public constructor(context: AudioContext, destination: AudioNode) {
    super(context)

    this.oscillator = context.createOscillator()
    this.setupOscillator(this.oscillator, context, destination)
  }

  public destroy(): void {
    super.destroy()
    if (this.oscillator != null) {
      this.oscillator.stop()
      this.oscillator.disconnect()
      // this.oscillator = null
    }
  }

  public start(): void {
    this.oscillator.start()
  }

  public setFrequency(frequency: number): void {
    if (frequency === this.frequency)
      return
    this.frequency = frequency

    const now = this.oscillator.context.currentTime
    this.oscillator.frequency.setValueAtTime(frequency, now)
  }

  protected abstract setupOscillator(oscillator: OscillatorNode, context: AudioContext,
                                     destination: AudioNode): void
}

class TriangleChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, _context: AudioContext,
                            destination: AudioNode): void {
    oscillator.type = 'triangle'
    oscillator.connect(this.gainNode)
    this.gainNode.connect(destination)
  }
}

class SawtoothChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, _context: AudioContext,
                            destination: AudioNode): void {
    oscillator.type = 'sawtooth'
    oscillator.connect(this.gainNode)
    this.gainNode.connect(destination)
  }
}

// ScriptProcessor Noise channel
const SP_NOISE_BUFFER_SIZE = 256
class SpNoiseChannel extends SoundChannel {
  private node: ScriptProcessorNode
  private sampler: NoiseSampler

  public constructor(context: AudioContext, destination: AudioNode) {
    super()

    this.sampler = new NoiseSampler(context.sampleRate)

    this.node = context.createScriptProcessor(SP_NOISE_BUFFER_SIZE, 1, 1)
    this.node.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0)
      this.sampler.fillBuffer(output)
    }
    this.node.connect(destination)
  }

  public destroy(): void {
    if (this.node != null) {
      // this.node.port.postMessage({action: 'stop'})
      this.node.disconnect()
      // this.node = null
    }
  }

  public start(): void {
  }

  public setVolume(volume: number): void {
    this.sampler.setVolume(volume)
  }

  public setNoisePeriod(period: number, mode: number): void {
    this.sampler.setPeriod(period, mode)
  }
}

// Audio-worklet Noise channel
const NOISE_WORKER_PASS = 'assets/noise_channel_worker.js'
class AwNoiseChannel extends SoundChannel {
  private node?: AudioWorkletNode

  public static create(context: AudioContext, destination: AudioNode): AwNoiseChannel|null {
    if (typeof(AudioWorkletNode) === 'undefined')
      return null
    return new AwNoiseChannel(context, destination)
  }

  private constructor(context: AudioContext, destination: AudioNode) {
    super()

    context.audioWorklet.addModule(NOISE_WORKER_PASS)
      .then(() => {
        this.node = new AudioWorkletNode(context, 'noise_worklet')
        this.node.connect(destination)
      })
      .catch(console.error)
  }

  public destroy(): void {
    if (this.node != null) {
      this.node.port.postMessage({action: 'stop'})
      this.node.disconnect()
      // this.node = null
    }
  }

  public start(): void {
  }

  public setVolume(volume: number): void {
    if (this.node != null)
      this.node.port.postMessage({action: 'volume', value: volume})
  }

  public setNoisePeriod(period: number, mode: number): void {
    if (this.node != null)
      this.node.port.postMessage({action: 'period', period, mode})
  }
}

// Pulse with duty ratio control.
class PulseChannel extends OscillatorChannel {
  private delay: DelayNode
  private dutyRatio = 0.5

  public destroy(): void {
    super.destroy()
    if (this.delay != null) {
      this.delay.disconnect()
      // this.delay = null
    }
  }

  public setFrequency(frequency: number): void {
    if (this.frequency === frequency)
      return
    super.setFrequency(frequency)

    this.updateDelay()
  }

  public setDutyRatio(dutyRatio: number): void {
    if (dutyRatio === this.dutyRatio)
      return
    this.dutyRatio = dutyRatio

    this.updateDelay()
  }

  protected setupOscillator(oscillator: OscillatorNode, context: AudioContext,
                            destination: AudioNode): void {
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

  private updateDelay(): void {
    const now = this.delay.context.currentTime
    this.delay.delayTime.setValueAtTime((1.0 - this.dutyRatio) / this.frequency, now)
  }
}

class DmcChannel extends OscillatorChannel {
  protected setupOscillator(_oscillator: OscillatorNode, _context: AudioContext,
                            _destination: AudioNode): void {
    // TODO: Implement
  }
}

function createSoundChannel(
    context: AudioContext, destination: AudioNode, type: WaveType,
): SoundChannel {
  switch (type) {
  case WaveType.PULSE:
    return new PulseChannel(context, destination)
  case WaveType.TRIANGLE:
    return new TriangleChannel(context, destination)
  case WaveType.NOISE:
    return AwNoiseChannel.create(context, destination) ||
        new SpNoiseChannel(context, destination)
  case WaveType.SAWTOOTH:
    return new SawtoothChannel(context, destination)
  case WaveType.DMC:
    return new DmcChannel(context, destination)
  }
}

export class AudioManager {
  private static initialized = false
  private static audioContextClass?: AudioContext
  private static context?: AudioContext
  private static masterGainNode: GainNode
  private static analyserNode?: AnalyserNode
  private static masterVolume = 1.0

  private channels = new Array<SoundChannel>()

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
      AudioManager.context = new audioContextClass() as AudioContext
      AudioManager.masterGainNode = AudioManager.context.createGain()
      AudioManager.masterGainNode.gain.setValueAtTime(
        AudioManager.masterVolume, AudioManager.context.currentTime)
      AudioManager.masterGainNode.connect(AudioManager.context.destination)
      AudioManager.initialized = true
    }
  }

  public static setMasterVolume(volume: number): void {
    AudioManager.checkSetUpCalled()
    AudioManager.masterVolume = volume

    const context = AudioManager.context
    if (context)
      AudioManager.masterGainNode.gain.setValueAtTime(volume, context.currentTime)
  }

  public static createAnalyser(): AnalyserNode | null {
    const context = AudioManager.context
    if (context == null)
      return null
    if (AudioManager.analyserNode == null) {
      AudioManager.analyserNode = context.createAnalyser()
      AudioManager.masterGainNode.disconnect()
      AudioManager.masterGainNode.connect(AudioManager.analyserNode)
      AudioManager.analyserNode.connect(context.destination)
    }
    return AudioManager.analyserNode
  }

  private static checkSetUpCalled(): void {
    if (!AudioManager.initialized) {
      console.error('Audio.setUp must be called!')
    }
  }

  constructor() {
    AudioManager.checkSetUpCalled()
  }

  public release(): void {
    this.releaseAllChannels()
  }

  public releaseAllChannels(): void {
    if (this.channels != null) {
      for (const channel of this.channels) {
        channel.destroy()
      }
      this.channels.length = 0
    }
  }

  public addChannel(type: WaveType): void {
    const context = AudioManager.context
    if (context == null)
      return

    const sc = createSoundChannel(context, AudioManager.masterGainNode, type)
    sc.start()
    this.channels.push(sc)
  }

  public setChannelFrequency(channel: number, frequency: number): void {
    if (AudioManager.context == null)
      return
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
    this.channels[channel].setDutyRatio(dutyRatio)
  }

  public setChannelPeriod(channel: number, period: number, mode: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setNoisePeriod(period, mode)
  }

  public muteAll(): void {
    const n = this.channels.length
    for (let ch = 0; ch < n; ++ch)
      this.setChannelVolume(ch, 0)
  }
}
