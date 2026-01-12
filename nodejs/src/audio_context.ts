import sdl from '@kmamal/sdl'

class AudioParam {
  public value = 0
  public setValueAtTime(value: number, _time: number): void {
    this.value = value
  }
}

abstract class AudioNode {
  protected inNodes = new Array<AudioNode>()
  protected outNodes = new Array<AudioNode>()

  public constructor(protected context: AudioContext) {
  }

  public connect(destNode: AudioNode): void {
    destNode.inNodes.push(this)
    this.outNodes.push(destNode)
  }

  public disconnect(): void {
    for (const node of this.outNodes) {
      const index = node.inNodes.indexOf(this)
      if (index >= 0)
        node.inNodes.splice(index, 1)
    }
    this.outNodes.length = 0
  }

  public start(): void {
  }

  public stop(): void {
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
    // this.oscType = OscillatorType.PERIODIC_WAVE
    //this.wave = wave

    // TODO: Calculate wave.
    this.oscType = OscillatorType.TRIANGLE
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
    const nodes = this.inNodes
    for (let i = 0; i < nodes.length; ++i)
      value += nodes[i].sample(counter, sampleRate)
    return value * gain
  }
}

export class DelayNode extends AudioNode {
  public delayTime = new AudioParam()

  public sample(counter: number, sampleRate: number): number {
    let value = 0
    const nodes = this.inNodes
    const c = counter - ((this.delayTime.value * sampleRate) | 0)
    for (let i = 0; i < nodes.length; ++i)
      value += nodes[i].sample(c, sampleRate)
    return value
  }
}

class OutputBuffer<T> {
  constructor(public buffer: T[]) {}

  public getChannelData(index: number) {
    return this.buffer[index]
  }
}

export class ScriptProcessorNode extends AudioNode {
  private index = 0
  private onaudioprocess: any = (_: any) => {}
  private outputBuffer: OutputBuffer<Float32Array>
  private ev: {outputBuffer: OutputBuffer<Float32Array>}

  public constructor(context: AudioContext, size: number, _inputChannels: number, outputChannels: number) {
    super(context)
    const buffer = [...Array(outputChannels)].map(_ => new Float32Array(size))
    this.outputBuffer = new OutputBuffer<Float32Array>(buffer)
    this.ev = {
      outputBuffer: this.outputBuffer,
    }
  }

  public sample(_counter: number, _sampleRate: number): number {
    if (this.index === 0) {
      this.onaudioprocess(this.ev)
    }
    const value = this.outputBuffer.buffer[0][this.index]
    if (++this.index >= this.outputBuffer.buffer[0].length) {
      this.index = 0
    }
    return value
  }
}

class AudioDestinationNode extends AudioNode {
  private time = 0
  private playbackInstance: any
  private buffer: Buffer
  private f32Array: Float32Array

  public constructor(context: AudioContext) {
    super(context)
    const channels = 1
    this.playbackInstance = sdl.audio.openDevice({type: 'playback'}, {
      channels,
      buffered: 512,
    })

    const frames = (1.0 / 60 * this.sampleRate) | 0
    this.buffer = Buffer.alloc(frames * 4 * channels)
    this.f32Array = new Float32Array(this.buffer.buffer)

    this.playbackInstance.play()
  }

  public get sampleRate(): number {
    return this.playbackInstance.frequency
  }

  public fillBuffer(array: Float32Array) {
    const len = array.length
    const nodes = this.inNodes
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

  public update(_dt: number) {
    this.fillBuffer(this.f32Array)
    this.playbackInstance.enqueue(this.buffer)
  }
}

export class AudioContext {
  private destination  = new AudioDestinationNode(this)

  public get sampleRate(): number {
    return this.destination.sampleRate
  }

  public update(dt: number): void {
    this.destination.update(dt)
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

  public createScriptProcessor(size: number, a: number, b: number): ScriptProcessorNode {
    return new ScriptProcessorNode(this, size, a, b)
  }

  public createPeriodicWave(real: Float32Array, imag: Float32Array): PeriodicWave {
    return new PeriodicWave(real, imag)
  }
}
