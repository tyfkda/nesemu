import {Reg, WaveType, DMC_LOOP_ENABLE, DMC_IRQ_ENABLE} from '../nes/apu'
import {NoiseSampler} from './apu_util'

const GLOBAL_MASTER_VOLUME = 0.5

abstract class SoundChannel {
  public abstract destroy(): void
  public abstract setVolume(_volume: number): void
  public abstract start(): void

  public setFrequency(_frequency: number): void { throw new Error('Invalid call') }
  public setDutyRatio(_dutyRatio: number): void { throw new Error('Invalid call') }
  public setNoisePeriod(_period: number, _mode: number): void { throw new Error('Invalid call') }
  public setDmcWrite(_reg: number, _value: number): void { throw new Error('Invalid call') }
  public setBlockiness(_context: AudioContext, _destination: AudioNode, _blockiness: boolean): void {}
}

abstract class GainSoundChannel extends SoundChannel {
  protected gainNode: GainNode
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

  public setVolume(volume: number): void {
    if (volume === this.volume)
      return
    this.volume = volume

    this.gainNode.gain.setValueAtTime(volume, this.gainNode.context.currentTime)
  }
}

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

class TriangleChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, context: AudioContext,
                            destination: AudioNode): void {
    this.setOscillatorBlockiness(context, destination, oscillator, false)
  }

  public setBlockiness(context: AudioContext, destination: AudioNode, blocky: boolean): void {
    this.oscillator.disconnect()

    const oscillator = this.oscillator = context.createOscillator()
    this.setOscillatorBlockiness(context, destination, oscillator, blocky)
    this.oscillator.frequency.setValueAtTime(this.frequency, context.currentTime)
    this.oscillator.start()
  }

  private setOscillatorBlockiness(
      context: AudioContext, destination: AudioNode, oscillator: OscillatorNode, blocky: boolean
  ): void {
    if (blocky) {
      const {an, bn} = createQuantizedTriangleWave(16, 128)
      const wave = context.createPeriodicWave(an, bn)
      oscillator.setPeriodicWave(wave)
    } else {
      oscillator.type = 'triangle'
    }
    oscillator.connect(this.gainNode)
    this.gainNode.connect(destination)
  }
}

class SawtoothChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, _context: AudioContext,
                            destination: AudioNode): void {
    oscillator.type = 'sawtooth'
    oscillator.connect(this.gainNode)
    this.gainNode.connect(destination)
  }
}

// ScriptProcessor Noise channel
const SP_NOISE_BUFFER_SIZE = 512
class SpNoiseChannel extends SoundChannel {
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

  public setVolume(volume: number): void {
    this.sampler.setVolume(volume)
  }

  public setNoisePeriod(period: number, mode: number): void {
    this.sampler.setPeriod(period, mode)
  }
}

// Audio-worklet Noise channel
const NOISE_WORKER_PASS = 'assets/noise_channel_worker.js'
class AwNoiseChannel extends SoundChannel {
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

  public setVolume(volume: number): void {
    if (this.node != null)
      this.node.port.postMessage({action: 'volume', value: volume})
  }

  public setNoisePeriod(period: number, mode: number): void {
    if (this.node != null)
      this.node.port.postMessage({action: 'period', period, mode})
  }
}

// Pulse with duty ratio control.
class PulseChannel extends OscillatorChannel {
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
    if (volume === this.volume)
      return
    this.volume = volume

    this.gainNode.gain.setValueAtTime(volume * this.negate, this.gainNode.context.currentTime)
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

// ScriptProcessor DMC channel
const SP_DMC_BUFFER_SIZE = 512
const kDmcRateTable = [
  428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54
]

function gcd(m: number, n: number): number {
  if (m < n) {
    const t = m
    m = n
    n = t
  }

  let r: number
  while ((r = m % n) !== 0) {
    m = n
    n = r
  }
  return n
}

class SpDmcChannel extends SoundChannel {
  private node: ScriptProcessorNode
  private regs = new Uint8Array(4)
  private volume = 0
  private sampleStep = 0
  private rateTable: Float32Array
  private rate = 0

  private dmaAddress = 0xc000
  private dmaLengthCounter = 1
  private dmaBuffered = false
  private dmaBuffer = 0
  private outActive = false
  private outShifter = 0
  private outDac = 0
  private outBuffer = 0
  private timer = 0

  public constructor(private triggerDma: (adr: number) => number, context: AudioContext, destination: AudioNode) {
    super()

    const APU_NOISE_HZ = 894887 * 2
    const sampleRate = context.sampleRate
    const g = gcd(APU_NOISE_HZ, sampleRate)
    const multiplier = Math.min(sampleRate / g, 0x7fff) | 0
    this.sampleStep = (APU_NOISE_HZ * multiplier / sampleRate) | 0

    this.rateTable = new Float32Array(kDmcRateTable.map(x => x * multiplier))
    this.rate = this.rateTable[0]

    this.node = context.createScriptProcessor(SP_DMC_BUFFER_SIZE, 0, 1)
    this.node.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0)
      if (this.volume <= 0) {
        output.fill(this.outDac * (4.0 / 127))
        return
      }

      const volume = this.volume * (4.0 / 127)
      const sampleStep = this.sampleStep | 0
      const rate = this.rate | 0
      let timer = this.timer | 0
      let value = this.outDac * volume
      for (let i = 0; i < output.length; ++i) {
        timer -= sampleStep
        if (timer < 0) {
          do {
            this.clockDac()
            this.clockDma()
            timer += rate
          } while (timer < 0)
          value = this.outDac * volume
        }
        output[i] = value
      }
      this.timer = timer
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

  public setVolume(volume: number): void {
    this.volume = volume
  }

  public setDmcWrite(reg: number, value: number): void {
    if (reg >= 4) {
      switch (reg) {
      case 0xff:
        if (value === 0) {
          this.dmaLengthCounter = 0
        } else if (this.dmaLengthCounter <= 0) {
          this.dmaLengthCounter = (this.regs[Reg.SAMPLE_LENGTH] << 4) + 1
          this.dmaAddress = 0xc000 + (this.regs[Reg.SAMPLE_ADDRESS] << 6)
          if (!this.dmaBuffered)
            this.doDma()
        }
        break
      default:
        break
      }
      return
    }

    this.regs[reg] = value
    switch (reg) {
    case Reg.STATUS:
      this.rate = this.rateTable[value & 0x0f]
      break
    case Reg.DIRECT_LOAD:
      this.outDac = value & 0x7f
      break
    case Reg.SAMPLE_ADDRESS:
      break
    case Reg.SAMPLE_LENGTH:
      break
    }
  }

  private clockDac(): boolean {
    if (this.outActive) {
      const n = this.outDac + ((this.outBuffer & 1) << 2) - 2  // +2 or -2
      this.outBuffer >>= 1
      if (0 <= n && n <= 0x7f && n != this.outDac) {
        this.outDac = n
        return true
      }
    }
    return false
  }

  private clockDma(): void {
    if (this.outShifter <= 0) {
      this.outShifter = 8
      this.outActive = this.dmaBuffered
      if (this.outActive) {
        this.dmaBuffered = false
        this.outBuffer = this.dmaBuffer
        if (this.dmaLengthCounter !== 0)
          this.doDma()
      }
    }
    --this.outShifter
  }

  private doDma(): void {
    this.dmaBuffer = this.triggerDma(this.dmaAddress)
    this.dmaAddress = 0x8000 | ((this.dmaAddress + 1) & 0x7fff)
    this.dmaBuffered = true
    this.dmaLengthCounter -= 1
    if (this.dmaLengthCounter <= 0) {
      if (this.regs[Reg.STATUS] & DMC_LOOP_ENABLE) {
        this.dmaLengthCounter = this.regs[Reg.SAMPLE_LENGTH] * 16 + 1
        this.dmaAddress = 0xc000 + this.regs[Reg.SAMPLE_ADDRESS] * 64
      } else if (this.regs[Reg.STATUS] & DMC_IRQ_ENABLE) {
        // this.cpu.do_irq(CPU::IRQ_DMC, this.cpu.current_clock)
      }
    }
  }
}

function createSoundChannel(
    context: AudioContext, destination: AudioNode, type: WaveType,
): SoundChannel {
  switch (type) {
  case WaveType.PULSE:
    return new PulseChannel(context, destination)
  case WaveType.TRIANGLE:
    return new TriangleChannel(context, destination)
  case WaveType.NOISE:
    return AwNoiseChannel.create(context, destination) ||
        new SpNoiseChannel(context, destination)
  case WaveType.SAWTOOTH:
    return new SawtoothChannel(context, destination)
  default:
    throw Error('Unhandled')
  }
}

export class AudioManager {
  private static initialized = false
  private static audioContextClass?: AudioContext
  private static context?: AudioContext
  private static masterGainNode: GainNode
  private static analyserNode?: AnalyserNode
  private static masterVolume = 1.0

  private channels = new Array<SoundChannel>()
  private blockiness = false

  public static setUp(audioContextClass: any): void {
    if (AudioManager.initialized)
      return

    if (audioContextClass == null)
      return
    AudioManager.audioContextClass = audioContextClass
    AudioManager.initialized = true
  }

  public static enableAudio(): void {
    if (AudioManager.context != null)
      return
    const audioContextClass: any = AudioManager.audioContextClass
    if (audioContextClass != null) {
      const context = new audioContextClass() as AudioContext
      AudioManager.context = context
      AudioManager.masterGainNode = context.createGain()
      AudioManager.masterGainNode.gain.setValueAtTime(
        AudioManager.masterVolume * GLOBAL_MASTER_VOLUME, context.currentTime)
      AudioManager.masterGainNode.connect(context.destination)
      AudioManager.initialized = true
    }
  }

  public static setMasterVolume(volume: number): void {
    AudioManager.checkSetUpCalled()
    AudioManager.masterVolume = volume

    const context = AudioManager.context
    if (context)
      AudioManager.masterGainNode.gain.setValueAtTime(volume * GLOBAL_MASTER_VOLUME, context.currentTime)
  }

  public static createAnalyser(): AnalyserNode | null {
    const context = AudioManager.context
    if (context == null)
      return null
    if (AudioManager.analyserNode == null) {
      AudioManager.analyserNode = context.createAnalyser()
      AudioManager.masterGainNode.disconnect()
      AudioManager.masterGainNode.connect(AudioManager.analyserNode)
      AudioManager.analyserNode.connect(context.destination)
    }
    return AudioManager.analyserNode
  }

  private static checkSetUpCalled(): void {
    if (!AudioManager.initialized) {
      console.error('Audio.setUp must be called!')
    }
  }

  constructor(private triggerDma: (adr: number) => number) {
    AudioManager.checkSetUpCalled()
  }

  public release(): void {
    this.releaseAllChannels()
  }

  public releaseAllChannels(): void {
    if (this.channels != null) {
      for (const channel of this.channels) {
        channel.destroy()
      }
      this.channels.length = 0
    }
  }

  public addChannel(type: WaveType): void {
    const context = AudioManager.context
    if (context == null)
      return

    let sc: SoundChannel
    if (type === WaveType.DMC) {
      sc = new SpDmcChannel(this.triggerDma, context, AudioManager.masterGainNode)
    } else {
      sc = createSoundChannel(context, AudioManager.masterGainNode, type)
    }
    sc.start()
    this.channels.push(sc)
  }

  public toggleBlockiness(): void {
    this.blockiness = !this.blockiness
    if (AudioManager.context != null) {
      for (const channel of this.channels)
      channel.setBlockiness(AudioManager.context, AudioManager.masterGainNode, this.blockiness)
    }
  }

  public getBlockiness(): boolean {
    return this.blockiness
  }

  public setChannelFrequency(channel: number, frequency: number): void {
    if (AudioManager.context == null)
      return

    frequency = Math.min(frequency, AudioManager.context.sampleRate * 0.5)
    this.channels[channel].setFrequency(frequency)
  }

  public setChannelVolume(channel: number, volume: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setVolume(volume)
  }

  public setChannelDutyRatio(channel: number, dutyRatio: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setDutyRatio(dutyRatio)
  }

  public setChannelPeriod(channel: number, period: number, mode: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setNoisePeriod(period, mode)
  }

  public setChannelDmcWrite(channel: number, buf: ReadonlyArray<number>): void {
    if (AudioManager.context == null)
      return
    for (let i = 0; i < buf.length; ++i) {
      const d = buf[i]
      const r = d >> 8
      const v = d & 0xff
      this.channels[channel].setDmcWrite(r, v)
    }
  }

  public muteAll(): void {
    const n = this.channels.length
    for (let ch = 0; ch < n; ++ch)
      this.setChannelVolume(ch, 0)
  }
}
