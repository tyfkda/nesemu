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
}

interface GainNode extends AudioNode {
  gain: AudioParam
}

interface DelayNode extends AudioNode {
  delayTime: AudioParam
}

interface AudioDestinationNode extends AudioNode {
}

interface AudioContext {
  readonly currentTime: number
  readonly destination: AudioDestinationNode

  createGain(): GainNode
  createOscillator(): OscillatorNode
  createPeriodicWave(real: Float32Array, imag: Float32Array): PeriodicWave
  createDelay(): DelayNode
}
