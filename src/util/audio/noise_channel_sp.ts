import {NoiseSampler} from './noise_sampler'
import {INoiseChannel} from './sound_channel'

// ScriptProcessor Noise channel
const SP_NOISE_BUFFER_SIZE = 512
export class SpNoiseChannel extends INoiseChannel {
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
