declare function __non_webpack_require__(fn: string)

interface AudioNode {
  readonly context: AudioContext

  connect(node: AudioNode): void
  disconnect(): void
  start(): void
}

interface AudioParam {
  value: number
  setValueAtTime(value: number, time: number)
}

interface PeriodicWave {
}

interface OscillatorNode extends AudioNode {
  type: string
  frequency: AudioParam

  setPeriodicWave(wave: PeriodicWave)
  stop()
}

interface GainNode extends AudioNode {
  gain: AudioParam
}

interface DelayNode extends AudioNode {
  delayTime: AudioParam
}

interface ScriptProcessorNode extends AudioNode {
  onaudioprocess: Function
}

interface AudioDestinationNode extends AudioNode {
}

interface AnalyserNode extends AudioNode {
}

type AudioWorkletNode = any
declare const AudioWorkletNode: AudioWorkletNode

interface AudioContext {
  readonly currentTime: number
  readonly destination: AudioDestinationNode
  readonly sampleRate: number
  readonly audioWorklet: any

  createGain(): GainNode
  createOscillator(): OscillatorNode
  createPeriodicWave(real: Float32Array, imag: Float32Array): PeriodicWave
  createDelay(): DelayNode
  createScriptProcessor(size: number, a: number, b: number): ScriptProcessorNode

  // Additional method:
  update(dt: number): void
}
