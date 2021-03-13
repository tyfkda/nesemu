declare function __non_webpack_require__(fn: string)

import {audio as SDLAudio} from 'node-sdl2/lib/audio'

const NS = __non_webpack_require__('node-sdl2')
const SDL_audio = NS.require('SDL_audio')

class AudioParam {
  public value = 0
  public setValueAtTime(value: number, _time: number): void {
    this.value = value
  }
}

abstract class AudioNode {
  protected connectedNodes = new Array<AudioNode>()

  public constructor(protected context: AudioContext) {
  }

  public connect(destNode: AudioNode): void {
    destNode.connectedNodes.push(this)
  }

  public disconnect(): void {
    // TODO:
  }

  public start(): void {
  }

  public abstract sample(counter: number, sampleRate: number): number
}

export class PeriodicWave {
  //private real: Float32Array
  //private imag: Float32Array

  constructor(_real: Float32Array, _imag: Float32Array) {
    //this.real = real
    //this.imag = imag
  }
}

const enum OscillatorType {
  NONE,
  // SQUARE,
  // SINE
  TRIANGLE,
  SAWTOOTH,
  PERIODIC_WAVE,
}

export class OscillatorNode extends AudioNode {
  public frequency = new AudioParam()

  private oscType = OscillatorType.NONE
  //private wave?: PeriodicWave

  public set type(value: string) {
    switch (value) {
    case 'triangle':  this.oscType = OscillatorType.TRIANGLE; break
    case 'sawtooth':  this.oscType = OscillatorType.SAWTOOTH; break
    default:          this.oscType = OscillatorType.NONE; break
    }
  }

  setPeriodicWave(_wave: PeriodicWave): void {
    this.oscType = OscillatorType.PERIODIC_WAVE
    //this.wave = wave
  }

  public sample(counter: number, sampleRate: number): number {
    switch (this.oscType) {
    case OscillatorType.TRIANGLE:
      {
        const waveLength = sampleRate / this.frequency.value
        const t = ((counter + sampleRate) * 4 / waveLength) % 4  // counter might be negative.
        return t < 2 ? t - 1 : 3 - t  // -1.0~1.0
      }
    case OscillatorType.SAWTOOTH:
      {
        const waveLength = sampleRate / this.frequency.value
        const t = ((counter + sampleRate) * 2 / waveLength) % 2  // counter might be negative.
        return t - 1  // -1.0~1.0
      }
    }
    // TODO: Implement
    return 0
  }
}

export class GainNode extends AudioNode {
  public gain = new AudioParam()

  public sample(counter: number, sampleRate: number): number {
    const gain = this.gain.value
    if (gain === 0)
      return 0

    let value = 0
    const nodes = this.connectedNodes
    for (let i = 0; i < nodes.length; ++i)
      value += nodes[i].sample(counter, sampleRate)
    return value * gain
  }
}

export class DelayNode extends AudioNode {
  public delayTime = new AudioParam()

  public sample(counter: number, sampleRate: number): number {
    let value = 0
    const nodes = this.connectedNodes
    const c = counter - ((this.delayTime.value * sampleRate) | 0)
    for (let i = 0; i < nodes.length; ++i)
      value += nodes[i].sample(c, sampleRate)
    return value
  }
}

class AudioDestinationNode extends AudioNode {
  private time = 0

  public fillBuffer(array: Float32Array) {
    const len = array.length
    const nodes = this.connectedNodes
    const sampleRate = this.context.sampleRate | 0
    let counter = Math.round(this.time * sampleRate) | 0
    for (let i = 0; i < len; ++i) {
      let value = 0
      for (let j = 0; j < nodes.length; ++j) {
        const node = nodes[j]
        value += node.sample((counter + i) | 0, sampleRate)
      }
      array[i] = value
    }
    this.time = ((counter + len) / sampleRate) % 1.0
  }

  // Dummy
  public sample(_counter: number, _sampleRate: number): number {
    return 0
  }
}

export class AudioContext {
  private audio: SDLAudio
  private destination  = new AudioDestinationNode(this)

  public get sampleRate(): number {
    return this.audio.spec.freq
  }

  public constructor() {
    this.audio = NS.audio.create()
    const options = {
      freq: 48000,
      channels: 1,
      format: SDL_audio.SDL_AudioFormatFlag.AUDIO_F32,
      samples: 512,
    }
    this.audio.openAudioDevice(options, (arrayBuffer: ArrayBuffer) => {
      const array = new Float32Array(arrayBuffer)
      this.destination.fillBuffer(array)
    })
  }

  public createGain(): GainNode {
    return new GainNode(this)
  }

  public createOscillator(): OscillatorNode {
    return new OscillatorNode(this)
  }

  public createDelay(): DelayNode {
    return new DelayNode(this)
  }

  public createPeriodicWave(real: Float32Array, imag: Float32Array): PeriodicWave {
    return new PeriodicWave(real, imag)
  }
}
