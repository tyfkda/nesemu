// APU: Audio Processing Unit

import {Address, Byte} from './types'
import {Util} from '../util/util'
import {CPU_HZ, VBlank} from './const'

export const enum PadBit {
  A = 0,
  B = 1,
  SELECT = 2,
  START = 3,
  U = 4,
  D = 5,
  L = 6,
  R = 7,

  REPEAT_A = 8,
  REPEAT_B = 9,
}

export const enum PadValue {
  A = 1 << PadBit.A,
  B = 1 << PadBit.B,
  SELECT = 1 << PadBit.SELECT,
  START = 1 << PadBit.START,
  U = 1 << PadBit.U,
  D = 1 << PadBit.D,
  L = 1 << PadBit.L,
  R = 1 << PadBit.R,

  REPEAT_A = 1 << PadBit.REPEAT_A,
  REPEAT_B = 1 << PadBit.REPEAT_B,
}

export const enum WaveType {
  PULSE,
  TRIANGLE,
  NOISE,
  DMC,
  SAWTOOTH,
}

const BASE = 0x4000
const STATUS_REG = 0x15
const PAD1_REG = 0x16
const PAD2_REG = 0x17
const FRAME_COUNTER = 0x17
const IRQ_INHIBIT = 1 << 6
const SEQUENCER_MODE = 1 << 7

const CONSTANT_VOLUME = 0x10
const LENGTH_COUNTER_HALT = 0x20
const LENGTH_COUNTER_HALT_TRI = 0x80
const ENVELOPE_LOOP = 0x20

export const DMC_LOOP_ENABLE = 0x40
export const DMC_IRQ_ENABLE = 0x80

const CHANNEL_COUNT = 5
const enum ApuChannel {
  PULSE1 = 0,
  PULSE2 = 1,
  TRIANGLE = 2,
  NOISE = 3,
  DMC = 4,
}

export const enum Reg {
  STATUS = 0,
  SWEEP = 1,
  TIMER_L = 2,
  TIMER_H = 3,

  // DMC
  DIRECT_LOAD = 1,     // eslint-disable-line @typescript-eslint/no-duplicate-enum-values
  SAMPLE_ADDRESS = 2,  // eslint-disable-line @typescript-eslint/no-duplicate-enum-values
  SAMPLE_LENGTH = 3,   // eslint-disable-line @typescript-eslint/no-duplicate-enum-values
}

export const kWaveTypes: WaveType[] = [
  WaveType.PULSE,
  WaveType.PULSE,
  WaveType.TRIANGLE,
  WaveType.NOISE,
  WaveType.DMC,
]

const kLengthTable = [
  0x0a, 0xfe, 0x14, 0x02, 0x28, 0x04, 0x50, 0x06, 0xa0, 0x08, 0x3c, 0x0a, 0x0e, 0x0c, 0x1a, 0x0e,
  0x0c, 0x10, 0x18, 0x12, 0x30, 0x14, 0x60, 0x16, 0xc0, 0x18, 0x48, 0x1a, 0x10, 0x1c, 0x20, 0x1e,
]

const kNoiseFrequencies =
      [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068]

const kPulseDutyRatio = [0.125, 0.25, 0.5, 0.75]

// ================================================================
// GamePad
export class GamePad {
  private status = 0
  private tmp = 0

  public setStatus(status: Byte): void {
    // Prevent simultaneous pressing on LR and UD.
    const LR = PadValue.L | PadValue.R, UD = PadValue.U | PadValue.D
    if ((status & LR) === LR)
      status &= ~LR
    if ((status & UD) === UD)
      status &= ~UD
    this.status = status & 0xff
  }

  public latch(): void {
    this.tmp = this.status
  }

  public shift(): number {
    const value = this.tmp
    this.tmp = value >> 1
    return value & 1
  }
}

// ================================================================

class Envelope {
  private divider = 0
  private decayLevel = 0
  private reset = false
  private reg: Byte = 0

  public clear(): void {
    this.divider = this.decayLevel = 0
  }

  public resetClock(): void {
    this.reset = true
  }

  public write(value: Byte): void {
    this.reg = value
    if ((value & CONSTANT_VOLUME) === 0) {
      this.divider = value & 0x0f
      // this.counter = 0x0f
    }
  }

  public getVolume(): number {
    const v = (this.reg & CONSTANT_VOLUME) !== 0 ? (this.reg & 15) : this.decayLevel
    return v * (1.0 / 15)
  }

  public update(): void {
    for (let i = 0; i < 4; ++i) {
      if (this.reset) {
        this.reset = false
        this.decayLevel = 0x0f
      } else if (this.divider > 0) {
        --this.divider
        continue
      } else if (this.decayLevel > 0) {
        --this.decayLevel
      } else if ((this.reg & ENVELOPE_LOOP) !== 0) {
        this.decayLevel = 0x0f
      }
      this.divider = this.reg & 0x0f
    }
  }
}

// ================================================================
// Sound channel
export interface IChannel {
  getVolume(): number
  getFrequency(): number
  setEnable(value: boolean): void
  isEnabled(): boolean
}

export abstract class ChannelBase implements IChannel {
  protected regs = new Uint8Array(4)
  protected enabled = false
  protected stopped = true

  public reset(): void {
    this.regs.fill(0)
    this.enabled = false
    this.stopped = true
  }

  public write(reg: Reg, value: Byte): void {
    this.regs[reg] = value
  }

  public getVolume(): number { return 0 }
  public getFrequency(): number { return 1 }
  public setEnable(value: boolean): void {
    this.enabled = value
    if (!value)
      this.stopped = true
  }
  public update(): void {}

  public isEnabled(): boolean {
    return this.enabled
  }

  public isPlaying(): boolean {
    return !this.stopped
  }
}

export interface IPulseChannel {
  getDutyRatio(): number
}

export interface INoiseChannel {
  getNoisePeriod(): ReadonlyArray<number>
}

export interface IDeltaModulationChannel {
  getWriteBuf(): ReadonlyArray<number>
}

export class PulseChannel extends ChannelBase implements IPulseChannel {
  private lengthCounter = 0
  private sweepCounter = 0
  private envelope = new Envelope()

  public reset(): void {
    super.reset()
    this.sweepCounter = 0
    this.envelope.clear()
  }

  public write(reg: Reg, value: Byte): void {
    super.write(reg, value)

    switch (reg) {
    case Reg.STATUS:
      this.envelope.write(value)
      break
    case Reg.SWEEP:
      this.sweepCounter = (value >> 4) & 7
      break
    case Reg.TIMER_H:
      this.lengthCounter = kLengthTable[value >> 3]
      this.stopped = false
      this.envelope.resetClock()
      break
    default:
      break
    }
  }

  public getVolume(): number {
    if (this.stopped)
      return 0
    return this.envelope.getVolume()
  }

  public getFrequency(): number {
    const value = this.regs[Reg.TIMER_L] + ((this.regs[Reg.TIMER_H] & 7) << 8)
    return ((CPU_HZ / 16) / (value + 1)) | 0
  }

  public getDutyRatio(): number {
    return kPulseDutyRatio[(this.regs[Reg.STATUS] >> 6) & 3]
  }

  public update(): void {
    if (this.stopped)
      return

    this.updateLength()
    this.envelope.update()
    this.sweep()
  }

  private updateLength(): void {
    const v = this.regs[Reg.STATUS]
    if ((v & LENGTH_COUNTER_HALT) !== 0)
      return
    let l = this.lengthCounter
    if (l <= 0) {
      l = 0
      this.stopped = true
    } else {
      l -= 2
      if (l < 0)
        l = 0
    }
    this.lengthCounter = l
  }

  // APU Sweep: http://wiki.nesdev.com/w/index.php/APU_Sweep
  private sweep(): void {
    const sweep = this.regs[Reg.SWEEP]
    if ((sweep & 0x80) === 0)  // Not enabled.
      return

    let c = this.sweepCounter
    c += 2  // 2 sequences per frame.
    const count = (sweep >> 4) & 7
    if (c >= count) {
      c -= count

      let freq = this.regs[Reg.TIMER_L] + ((this.regs[Reg.TIMER_H] & 7) << 8)
      const shift = sweep & 7
      if (shift > 0) {
        const add = freq >> shift
        if ((sweep & 0x08) === 0) {
          freq += add
          if (freq > 0x07ff)
            this.stopped = true
        } else {
          freq -= add
          if (freq < 8)
            this.stopped = true
        }
        this.regs[Reg.TIMER_L] = freq & 0xff
        this.regs[Reg.TIMER_H] = (this.regs[Reg.TIMER_H] & ~7) | ((freq & 0x0700) >> 8)
      }

      c -= 2  // 2 sequences per frame
      if (c <= 0) {
        this.sweepCounter = ((sweep >> 4) & 7) + c
      }
    }
    this.sweepCounter = c
  }
}

class TriangleChannel extends ChannelBase {
  private lengthCounter = 0
  private linearCounter = 0
  private linearReload = false

  public write(reg: Reg, value: Byte): void {
    super.write(reg, value)

    switch (reg) {
    case Reg.TIMER_H:
      this.lengthCounter = kLengthTable[value >> 3]
      this.stopped = false
      this.linearReload = true
      break
    default:
      break
    }
  }

  public getVolume(): number {
    if (this.stopped || this.linearCounter <= 0)
      return 0
    return 1
  }

  public getFrequency(): number {
    const value = this.regs[Reg.TIMER_L] + ((this.regs[Reg.TIMER_H] & 7) << 8)
    return ((CPU_HZ / 32) / (value + 1)) | 0
  }

  public update(): void {
    if (this.stopped)
      return

    this.updateLinear()
    this.updateLength()
  }

  private updateLinear(): void {
    for (let i = 0; i < 4; ++i) {
      if (this.linearReload) {
        this.linearCounter = this.regs[Reg.STATUS] & 0x7f
      } else if (this.linearCounter > 0) {
        --this.linearCounter
      } else {
        this.stopped = true
      }

      if ((this.regs[Reg.STATUS] & LENGTH_COUNTER_HALT_TRI) === 0)
        this.linearReload = false
    }
  }

  private updateLength(): void {
    if (this.lengthCounter >= 2) {
      this.lengthCounter -= 2
    } else {
      this.lengthCounter = 0
      if ((this.regs[Reg.STATUS] & LENGTH_COUNTER_HALT_TRI) === 0) {
        this.stopped = true
      }
    }
  }
}

class NoiseChannel extends ChannelBase implements INoiseChannel {
  private lengthCounter = 0
  private envelope = new Envelope()
  private noisePeriod = [0, 0]

  public reset(): void {
    super.reset()
    this.envelope.clear()
  }

  public write(reg: Reg, value: Byte): void {
    super.write(reg, value)

    switch (reg) {
    case Reg.STATUS:
      this.envelope.write(value)
      break
    case Reg.TIMER_L:
      {
        const val = this.regs[Reg.TIMER_L]
        this.noisePeriod[0] = kNoiseFrequencies[val & 15]
        this.noisePeriod[1] = (val >> 7) & 1
      }
      break
    case Reg.TIMER_H:  // Set length.
      this.lengthCounter = kLengthTable[value >> 3]
      this.stopped = false
      this.envelope.resetClock()
      break
    default:
      break
    }
  }

  public getVolume(): number {
    if (this.stopped)
      return 0
    return this.envelope.getVolume()
  }

  public getFrequency(): number {
    throw new Error('Invalid call')
  }

  public getNoisePeriod(): ReadonlyArray<number> {
    return this.noisePeriod
  }

  public update(): void {
    if (this.stopped)
      return

    this.updateLength()
    this.envelope.update()
  }

  private updateLength(): void {
    const v = this.regs[Reg.STATUS]
    if ((v & LENGTH_COUNTER_HALT) !== 0)
      return
    let l = this.lengthCounter
    if (l <= 0) {
      l = 0
      if ((this.regs[2] & 0x80) === 0) {
        this.stopped = true
      }
    } else {
      l -= 2
      if (l < 0)
        l = 0
    }
    this.lengthCounter = l
  }
}

// DMC
class DeltaModulationChannel extends ChannelBase implements IDeltaModulationChannel {
  private regsLengthCounter = 1
  private dmaLengthCounter = 0

  private currWriteBuf: number[] = []
  private prevWriteBuf: number[] = []

  public constructor(private triggerIrq: () => void) {
    super()
  }

  public setEnable(value: boolean): void {
    this.enabled = value
    this.stopped = !value
    if (value) {
      if (this.dmaLengthCounter === 0) {
        this.dmaLengthCounter = this.regsLengthCounter
      }
    } else {
      this.dmaLengthCounter = 0
    }

    // Put enable setting to command buffer.
    this.currWriteBuf.push((0xff << 8) | (value ? 1 : 0))
  }

  public write(reg: Reg, value: Byte): void {
    super.write(reg, value)
    this.currWriteBuf.push((reg << 8) | value)

    switch (reg) {
    case Reg.TIMER_H:  // Set length.
      this.regsLengthCounter = ((value << 4) + 1) * 8
      break
    default:
      break
    }
  }

  public getWriteBuf(): ReadonlyArray<number> {
    return this.prevWriteBuf
  }

  public getVolume(): number {
    return this.stopped ? 0 : 1
  }

  public getFrequency(): number {
    throw new Error('Invalid call')
  }

  public onHblank(hcount: number): void {
    this.updateLength()

    if (hcount === VBlank.NMI) {
      // Swap buffers
      const tmp = this.currWriteBuf
      this.currWriteBuf = this.prevWriteBuf
      this.prevWriteBuf = tmp
      this.currWriteBuf.length = 0
    }
  }

  private updateLength(): void {
    if (this.stopped)
      return

    let l = this.dmaLengthCounter
    if (l <= 0) {
      l = 0
      if ((this.regs[0] & DMC_LOOP_ENABLE) === 0) {
        this.stopped = true
        if ((this.regs[0] & DMC_IRQ_ENABLE) !== 0)
          this.triggerIrq()
      } else {
        l = this.regsLengthCounter
      }
    } else {
      l -= 1
      if (l < 0)
        l = 0
    }
    this.dmaLengthCounter = l
  }
}

// ================================================================
// Apu
export class Apu {
  private regs = new Uint8Array(0x20)
  private channels: Array<ChannelBase>
  private frameInterrupt = 0  // 0=not occurred, 0x40=occurred
  private dmcInterrupt = 0x80  // 0=not occurred, 0x80=occurred

  constructor(private gamePads: GamePad[], private triggerIrq: () => void) {
    this.regs.fill(0)
    this.regs[FRAME_COUNTER] = IRQ_INHIBIT

    this.channels = kWaveTypes.map((t: WaveType): ChannelBase => {
      switch (t) {
      case WaveType.PULSE:
        return new PulseChannel()
      case WaveType.TRIANGLE:
        return new TriangleChannel()
      case WaveType.NOISE:
        return new NoiseChannel()
      case WaveType.DMC:
        return new DeltaModulationChannel(triggerIrq)
      default:
        throw new Error('Illegal wave type')
      }
    })
  }

  public getWaveTypes(): WaveType[] {
    return kWaveTypes
  }

  public getChannel(ch: number): ChannelBase {
    return this.channels[ch]
  }

  public reset(): void {
    this.frameInterrupt = 0
    this.dmcInterrupt = 0x80  // TODO: Implement
    this.channels.forEach(channel => { channel.reset() })
  }

  public save(): object {
    return {
      regs: Util.convertUint8ArrayToBase64String(this.regs),
    }
  }

  public load(saveData: any): void {
    const regs = Util.convertBase64StringToUint8Array(saveData.regs)
    for (let i = 0; i < regs.length; ++i)
      this.write(i + BASE, regs[i])
  }

  public read(adr: Address): Byte {
    const reg = adr - BASE
    switch (reg) {
    case STATUS_REG:
      {
        let result = this.dmcInterrupt | this.frameInterrupt
        for (let ch = 0; ch < CHANNEL_COUNT; ++ch) {
          if ((this.regs[STATUS_REG] & (1 << ch)) !== 0 && this.channels[ch].isPlaying())
            result |= 1 << ch
        }

        // Reading this register clears the frame interrupt flag (but not the DMC interrupt flag).
        this.frameInterrupt = 0
        return result
      }
    case PAD1_REG:
    case PAD2_REG:
      return this.gamePads[reg - PAD1_REG].shift()
    default:
      return 0
    }
  }

  public write(adr: Address, value: Byte): void {
    const reg = adr - BASE
    if (reg >= 0x20)
      return

    this.regs[reg] = value

    if (reg < 0x14) {  // Sound
      const ch = reg >> 2
      const r = reg & 3
      this.channels[ch].write(r, value)
    }

    switch (reg) {
    case STATUS_REG:
      this.dmcInterrupt = 0  // Writing to this register clears the DMC interrupt flag.
      for (let ch = 0; ch < CHANNEL_COUNT; ++ch)
        this.channels[ch].setEnable((value & (1 << ch)) !== 0)
      break
    case PAD1_REG:  // Pad status. bit0 = Controller shift register strobe
      if ((value & 1) === 0) {
        for (const pad of this.gamePads)
          pad.latch()
      }
      break
    default:
      break
    }
  }

  public onHblank(hcount: number): void {
    (this.channels[ApuChannel.DMC] as DeltaModulationChannel).onHblank(hcount)

    switch (hcount) {
    case VBlank.NMI:
      this.channels.forEach(channel => channel.update())
      if (this.isIrqEnabled()) {
        this.frameInterrupt = 0x40
        this.triggerIrq()
      }
      break
    default:
      break
    }
  }

  private isIrqEnabled(): boolean {
    // http://wiki.nesdev.com/w/index.php/IRQ
    // Enable: $4017 write with bits 7-6 = 00
    return (this.regs[FRAME_COUNTER] & (IRQ_INHIBIT | SEQUENCER_MODE)) === 0
  }
}
