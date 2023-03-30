// Base class.
export abstract class SoundChannel {
  public abstract destroy(): void
  public abstract setEnable(enable: boolean): void
  public abstract setVolume(volume: number): void
  public abstract start(): void

  public setFrequency(_frequency: number): void { throw new Error('Invalid call') }
  public setDutyRatio(_dutyRatio: number): void { throw new Error('Invalid call') }
  public setNoisePeriod(_period: number, _mode: number): void { throw new Error('Invalid call') }
  public setDmcWrite(_reg: number, _value: number): void { throw new Error('Invalid call') }
}

// Volume controllable.
abstract class GainSoundChannel extends SoundChannel {
  protected gainNode: GainNode
  protected enable = true
  protected volume = 0

  public constructor(context: AudioContext) {
    super()
    this.gainNode = context.createGain()
    this.gainNode.gain.setValueAtTime(this.volume, context.currentTime)
  }

  public destroy(): void {
    if (this.gainNode != null) {
      this.gainNode.disconnect()
      // this.gainNode = null
    }
  }

  public setEnable(enable: boolean): void {
    if (enable === this.enable)
      return
    this.enable = enable

    if (!enable)
      this.gainNode.gain.setValueAtTime(0, this.gainNode.context.currentTime)
  }

  public setVolume(volume: number): void {
    if (volume === this.volume)
      return
    this.volume = volume

    this.gainNode.gain.setValueAtTime(volume, this.gainNode.context.currentTime)
  }
}

// Frequency controllable.
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

//

function createQuantizedTriangleWave(div: number, N: number): {an: Float32Array, bn: Float32Array} {
  const an = new Float32Array(N + 1)
  an[0] = 0
  const coeff = 2 / (div - 1)
  for (let i = 1; i <= N; ++i) {
    let a = 0
    const fa = (x: number) => 1 / (2 * i * Math.PI) *  Math.sin(2 * i * Math.PI * x)
    for (let j = 0; j < div * 2; ++j) {
      const k = j < div ? 1 - j * coeff : -1 + (j - div) * coeff
      a += k * (fa((j + 1) / (2 * div)) - fa(j / (2 * div)))
    }
    an[i] = 2 * a
  }
  const bn = new Float32Array(N + 1)
  bn.fill(0)
  return {an, bn}
}

export class TriangleChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, context: AudioContext,
                            destination: AudioNode): void {
    const {an, bn} = createQuantizedTriangleWave(16, 128)
    const wave = context.createPeriodicWave(an, bn)
    oscillator.setPeriodicWave(wave)
    oscillator.connect(this.gainNode)
    this.gainNode.connect(destination)
  }
}

export class SawtoothChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, _context: AudioContext,
                            destination: AudioNode): void {
    oscillator.type = 'sawtooth'
    oscillator.connect(this.gainNode)
    this.gainNode.connect(destination)
  }
}

// Pulse with duty ratio control.
export class PulseChannel extends OscillatorChannel {
  private delay: DelayNode
  private dutyRatio = 0.5
  private negate = 1  // +1 or -1

  public destroy(): void {
    super.destroy()
    if (this.delay != null) {
      this.delay.disconnect()
      // this.delay = null
    }
  }

  public setVolume(volume: number): void {
    super.setVolume(volume * this.negate)
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
    this.negate = dutyRatio <= 0.5 ? 1 : -1

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
    const dutyRatio = this.dutyRatio <= 0.5 ? this.dutyRatio : 1 - this.dutyRatio
    this.delay.delayTime.setValueAtTime(dutyRatio / this.frequency, now)
  }
}
