// APU: Audio Processing Unit

import {Address, Byte} from './types'

export enum PadBit {
  A = 0,
  B = 1,
  SELECT = 2,
  START = 3,
  U = 4,
  D = 5,
  L = 6,
  R = 7,
}

export enum PadValue {
  A = 1 << PadBit.A,
  B = 1 << PadBit.B,
  SELECT = 1 << PadBit.SELECT,
  START = 1 << PadBit.START,
  U = 1 << PadBit.U,
  D = 1 << PadBit.D,
  L = 1 << PadBit.L,
  R = 1 << PadBit.R,
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
const CPU_CLOCK = 1789773  // Hz

const CHANNEL_COUNT = 4
const CH_PULSE1 = 0
const CH_PULSE2 = 1
const CH_TRIANGLE = 2
const CH_NOISE = 3

const REG_STATUS = 0
const REG_SWEEP = 1
const REG_TIMER_L = 2
const REG_TIMER_H = 3

const kLengthTable = [
  0x0a, 0xfe, 0x14, 0x02, 0x28, 0x04, 0x50, 0x06, 0xa0, 0x08, 0x3c, 0x0a, 0x0e, 0x0c, 0x1a, 0x0e,
  0x0c, 0x10, 0x18, 0x12, 0x30, 0x14, 0x60, 0x16, 0xc0, 0x18, 0x48, 0x1a, 0x10, 0x1c, 0x20, 0x1e,
]

const kNoiseFrequencies = (
  [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068]
    .map(v => v * 110))

const VBLANK_START = 241

// ================================================================
// GamePad
class GamePad {
  private status = new Uint8Array(2)
  private tmp = new Uint8Array(2)

  public setStatus(no: number, status: Byte): void {
    this.status[no] = status
  }

  public latch(): void {
    this.tmp[0] = this.status[0]
    this.tmp[1] = this.status[1]
  }

  public shift(no: number): number {
    const value = this.tmp[no]
    this.tmp[no] = value >> 1
    return value & 1
  }
}

// ================================================================
// Sound channel
class Channel {
  protected regs = new Uint8Array(4)
  protected stopped = true

  public reset() {
    this.regs.fill(0)
    this.stopped = true
  }

  public write(reg: number, value: Byte) {
    this.regs[reg] = value
  }

  public getVolume(): number { return 0 }
  public getFrequency(): number { return 0 }
  public stop() {
    this.stopped = true
  }
  public update(): void {}

  public isPlaying(): boolean {
    return !this.stopped
  }
}

class PulseChannel extends Channel {
  private lengthCounter = 0
  private sweepCounter = 0

  private envelopeDivider = 0  // i.e. Envelope counter
  private envelopeCounter = 0  // i.e. Envelope volume
  private envelopeReset = false

  public reset() {
    super.reset()
    this.sweepCounter = 0
    this.envelopeDivider = this.envelopeCounter = 0
  }

  public write(reg: number, value: Byte) {
    super.write(reg, value)

    switch (reg) {
    case REG_STATUS:
      this.stopped = false
      if ((value & CONSTANT_VOLUME) === 0) {
        this.envelopeDivider = value & 0x0f
        this.envelopeCounter = 0x0f
      }
      break
    case REG_SWEEP:
      this.sweepCounter = (value >> 4) & 7
      break
    case REG_TIMER_H:
      this.lengthCounter = kLengthTable[value >> 3]
      this.stopped = false
      this.envelopeReset = true
      break
    default:
      break
    }
  }

  public getVolume(): number {
    if (this.stopped)
      return 0

    let v = this.regs[REG_STATUS]
    if ((v & CONSTANT_VOLUME) !== 0)
      return (v & 15) / 15
    return this.envelopeCounter / 15
  }

  public getFrequency(): number {
    const value = this.regs[REG_TIMER_L] + ((this.regs[REG_TIMER_H] & 7) << 8)
    return ((CPU_CLOCK / 16) / (value + 1)) | 0
  }

  public update(): void {
    if (this.stopped)
      return

    this.updateLength()
    this.updateEnvelope()
    this.sweep()
  }

  private updateLength(): void {
    let v = this.regs[REG_STATUS]
    if ((v & LENGTH_COUNTER_HALT) !== 0)
      return
    let l = this.lengthCounter - 4
    if (l <= 0) {
      l = 0
      this.stopped = true
    }
    this.lengthCounter = l
  }

  private updateEnvelope(): void {
    if ((this.regs[REG_STATUS] & CONSTANT_VOLUME) !== 0)
      return

    if (this.envelopeReset) {
      this.envelopeReset = false
      this.envelopeCounter = 0x0f
      this.envelopeDivider = this.regs[REG_STATUS] & 0x0f
      return
    }

    const DEC = 2;
    if (this.envelopeDivider >= DEC) {
      this.envelopeDivider -= DEC
    } else {
      if (this.envelopeCounter > 0) {
        --this.envelopeCounter
        this.envelopeDivider += this.regs[REG_STATUS] & 0x0f
      } else {
        this.envelopeCounter = 0
        if ((this.regs[REG_STATUS] & ENVELOPE_LOOP) !== 0) {
          this.envelopeCounter = 0x0f
          this.envelopeDivider += this.regs[REG_STATUS] & 0x0f
        }
      }
    }
  }

  // APU Sweep: http://wiki.nesdev.com/w/index.php/APU_Sweep
  private sweep(): void {
    const sweep = this.regs[REG_SWEEP]
    if ((sweep & 0x80) === 0)  // Not enabled.
      return

    let c = this.sweepCounter
    c += 2  // 2 sequences per frame.
    const count = (sweep >> 4) & 7
    if (c >= count) {
      c -= count

      let freq = this.regs[REG_TIMER_L] + ((this.regs[REG_TIMER_H] & 7) << 8)
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
        this.regs[REG_TIMER_L] = freq & 0xff
        this.regs[REG_TIMER_H] = (this.regs[REG_TIMER_H] & ~7) | ((freq & 0x0700) >> 8)
      }

      c -= 2  // 2 sequences per frame
      if (c <= 0) {
        this.sweepCounter = ((sweep >> 4) & 7) + c
      }
    }
    this.sweepCounter = c
  }
}

class TriangleChannel extends Channel {
  private lengthCounter = 0

  public write(reg: number, value: Byte) {
    super.write(reg, value)

    switch (reg) {
    case REG_STATUS:
    case REG_TIMER_H:
      this.lengthCounter = this.regs[REG_STATUS] & 0x7f
      this.stopped = this.lengthCounter <= 0
      break
    default:
      break
    }
  }

  public getVolume(): number {
    if (this.stopped)
      return 0
    return 1
  }

  public getFrequency(): number {
    const value = this.regs[REG_TIMER_L] + ((this.regs[REG_TIMER_H] & 7) << 8)
    return ((CPU_CLOCK / 32) / (value + 1)) | 0
  }

  public update(): void {
    if (this.stopped)
      return

    this.updateLength()
  }

  private updateLength(): void {
    let v = this.regs[REG_STATUS]
    if ((v & LENGTH_COUNTER_HALT_TRI) !== 0)
      return
    let l = this.lengthCounter - 4
    if (l <= 0) {
      l = 0
      this.stopped = true
    }
    this.lengthCounter = l
  }
}

class NoiseChannel extends Channel {
  private lengthCounter = 0

  public write(reg: number, value: Byte) {
    super.write(reg, value)

    switch (reg) {
    case REG_TIMER_H:  // Set length.
      this.lengthCounter = kLengthTable[value >> 3]
      this.stopped = false
      break
    default:
      break
    }
  }

  public getVolume(): number {
    if (this.stopped)
      return 0

    let v = this.regs[REG_STATUS]
    if ((v & CONSTANT_VOLUME) !== 0)
      return (v & 15) / 15
    return 1
  }

  public getFrequency(): number {
    const period = this.regs[REG_TIMER_L] & 15
    return kNoiseFrequencies[period]
  }

  public update() {
    if (this.stopped)
      return

    this.updateLength()
  }

  private updateLength(): void {
    let v = this.regs[REG_STATUS]
    if ((v & LENGTH_COUNTER_HALT) !== 0)
      return
    let l = this.lengthCounter - 4
    if (l <= 0) {
      l = 0
      if ((this.regs[2] & 0x80) === 0) {
        this.stopped = true
      }
    }
    this.lengthCounter = l
  }
}

// ================================================================
// Apu
export class Apu {
  private regs = new Uint8Array(0x20)
  private channels = new Array<Channel>(CHANNEL_COUNT)
  private frameInterrupt = 0  // 0=not occurred, 0x40=occurred
  private dmcInterrupt = 0x80  // 0=not occurred, 0x80=occurred
  private gamePad = new GamePad()

  constructor(private triggerIrq: () => void) {
    this.channels[CH_PULSE1] = new PulseChannel()
    this.channels[CH_PULSE2] = new PulseChannel()
    this.channels[CH_TRIANGLE] = new TriangleChannel()
    this.channels[CH_NOISE] = new NoiseChannel()
  }

  public reset() {
    this.regs.fill(0)
    this.regs[FRAME_COUNTER] = IRQ_INHIBIT
    this.frameInterrupt = 0
    this.dmcInterrupt = 0x80  // TODO: Implement
    this.channels.forEach(channel => { channel.reset() })
  }

  public read(adr: Address): Byte {
    const reg = adr - BASE
    switch (reg) {
    case STATUS_REG:
      {
        // TODO: Implement.
        let result = this.dmcInterrupt | this.frameInterrupt
        for (let ch = 0; ch < CHANNEL_COUNT; ++ch) {
          if (this.channels[ch].isPlaying())
            result |= 1 << ch
        }

        // Reading this register clears the frame interrupt flag (but not the DMC interrupt flag).
        this.frameInterrupt = 0
        return result
      }
    case PAD1_REG:
    case PAD2_REG:
      return this.gamePad.shift(reg - PAD1_REG)
    default:
      return 0
    }
  }

  public write(adr: Address, value: Byte): void {
    const reg = adr - BASE
    if (reg >= 0x20)
      return

    this.regs[reg] = value

    if (reg < 0x10) {  // Sound
      const ch = reg >> 2
      const r = reg & 3
      this.channels[ch].write(r, value)
    }

    switch (reg) {
    case STATUS_REG:
      this.dmcInterrupt = 0  // Writing to this register clears the DMC interrupt flag.
      for (let ch = 0; ch < CHANNEL_COUNT; ++ch) {
        if ((value & (1 << ch)) === 0)
          this.channels[ch].stop()
      }
      break
    case PAD1_REG:  // Pad status. bit0 = Controller shift register strobe
      if ((value & 1) === 0) {
        this.gamePad.latch()
      }
      break
    default:
      break
    }
  }

  public getVolume(ch: number): number {
    if ((this.regs[STATUS_REG] & (1 << ch)) === 0)
      return 0
    return this.channels[ch].getVolume()
  }

  public getFrequency(ch: number): number {
    return this.channels[ch].getFrequency()
  }

  public setPadStatus(no: number, status: Byte): void {
    this.gamePad.setStatus(no, status)
  }

  public onHblank(hcount: number): void {
    switch (hcount) {
    case VBLANK_START:
      this.channels.forEach(channel => { channel.update() })
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
