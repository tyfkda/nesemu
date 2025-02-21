import {SpDmcChannel} from '../util/audio/delta_modulation_channel_sp'
import {SpNoiseChannel} from '../util/audio/noise_channel_sp'
import {AwDmcChannel} from '../util/audio/delta_modulation_channel_worker'
import {AwNoiseChannel} from '../util/audio/noise_channel_worker'
import {IDmcChannel, INoiseChannel} from '../util/audio/sound_channel'
import {AudioManager} from '../util/audio_manager'
import DcRemoveWorkletURL from '../dc_remove_worker.ts?worker&url'

export class AudioManagerForBrowser extends AudioManager {
  protected static analyserNode?: AnalyserNode

  public static createAnalyser(): AnalyserNode | null {
    const context = AudioManager.context
    if (context == null)
      return null
    if (AudioManagerForBrowser.analyserNode == null) {
      AudioManagerForBrowser.analyserNode = context.createAnalyser()
      AudioManagerForBrowser.createDcRemoveFilter(context)
          .then((node) => {
            AudioManager.masterGainNode.connect(node)
            node.connect(AudioManagerForBrowser.analyserNode!)
          })
          .catch(() => {
            AudioManager.masterGainNode.connect(AudioManagerForBrowser.analyserNode!)
          })
    }
    return AudioManagerForBrowser.analyserNode
  }

  private static async createDcRemoveFilter(context: AudioContext): Promise<AudioWorkletNode> {
    if (typeof(AudioWorkletNode) === 'undefined')
      return Promise.reject()
    await context.audioWorklet.addModule(DcRemoveWorkletURL)
    return new AudioWorkletNode(context, 'dc_remove_worklet')
  }

  override createNoiseChannel(context: AudioContext, destination: AudioNode): INoiseChannel {
    return AwNoiseChannel.create(context, destination) ||
        new SpNoiseChannel(context, destination)
  }

  override createDmcChannel(context: AudioContext, destination: AudioNode): IDmcChannel {
    return AwDmcChannel.create(context, destination) ||
        new SpDmcChannel(context, destination)
  }
}
