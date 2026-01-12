import {AudioManager} from '../../src/util/audio_manager'
import {SpDmcChannel} from '../../src/util/audio/delta_modulation_channel_sp'
import {SpNoiseChannel} from '../../src/util/audio/noise_channel_sp'
import {IDmcChannel, INoiseChannel} from '../../src/util/audio/sound_channel'

export class AudioManagerForNode extends AudioManager {
  createNoiseChannel(context: AudioContext, destination: AudioNode): INoiseChannel {
    return new SpNoiseChannel(context, destination)
  }

  createDmcChannel(context: AudioContext, destination: AudioNode): IDmcChannel {
    return new SpDmcChannel(context, destination)
  }
}
