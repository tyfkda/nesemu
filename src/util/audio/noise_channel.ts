import {NoiseSampler} from './noise_sampler'
import {SoundChannel} from './sound_channel'

export abstract class INoiseChannel extends SoundChannel {
  public abstract setNoisePeriod(period: number, mode: number): void
}

// ScriptProcessor Noise channel
const SP_NOISE_BUFFER_SIZE = 512
class SpNoiseChannel extends INoiseChannel {
  private node: ScriptProcessorNode
  private sampler: NoiseSampler

  public constructor(context: AudioContext, destination: AudioNode) {
    super()

    this.sampler = new NoiseSampler(context.sampleRate)

    this.node = context.createScriptProcessor(SP_NOISE_BUFFER_SIZE, 0, 1)
    this.node.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0)
      this.sampler.fillBuffer(output)
    }
    this.node.connect(destination)
  }

  public destroy(): void {
    if (this.node != null) {
      this.node.disconnect()
      // this.node = null
    }
  }

  public start(): void {
  }

  public setEnable(enable: boolean): void {
    this.sampler.setEnable(enable)
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
class AwNoiseChannel extends INoiseChannel {
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

  public setEnable(enable: boolean): void {
    if (this.node != null)
      this.node.port.postMessage({action: 'enable', value: enable})
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

export function createNoiseChannel(context: AudioContext, destination: AudioNode): INoiseChannel {
  return AwNoiseChannel.create(context, destination) ||
      new SpNoiseChannel(context, destination)
}
