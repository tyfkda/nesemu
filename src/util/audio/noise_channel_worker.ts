import NoiseWorkletURL from '../../noise_channel_worker.ts?worker&url'
import {INoiseChannel} from './sound_channel'

// Audio-worklet Noise channel
export class AwNoiseChannel extends INoiseChannel {
  private node?: AudioWorkletNode

  public static create(context: AudioContext, destination: AudioNode): AwNoiseChannel|null {
    if (typeof(AudioWorkletNode) === 'undefined')
      return null
    return new AwNoiseChannel(context, destination)
  }

  private constructor(context: AudioContext, destination: AudioNode) {
    super()

    context.audioWorklet.addModule(NoiseWorkletURL)
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
