import {Address, Byte} from "../types";
import {IChannel, IPulseChannel, WaveType} from "../apu";

const kWaveTypes: WaveType[] = [
  WaveType.PULSE,  // 仮
]

export const Reg = {
  // + 0x4080
  VOLUME_ENVELOPE  : 0x00,
  FREQUENCY_LOW    : 0x02,
  FREQUENCY_HIGH   : 0x03,
  MOD_ENVELOPE     : 0x04,
  ENVELOPE_SPEED   : 0x0a,
} as const
type Reg = typeof Reg[keyof typeof Reg];

export class FdsChannel implements IChannel, IPulseChannel {
  protected regs = new Uint8Array(0x40)
  // protected enabled = false
  // protected stopped = true
  protected enabled = true
  protected stopped = false

  public reset(): void {
    this.regs.fill(0)
    this.enabled = false
    this.stopped = true
  }

  public write(reg: Reg, value: Byte): void {
    this.regs[reg] = value
  }

  public getVolume(): number {
    const volenv = this.regs[Reg.VOLUME_ENVELOPE]
    if ((volenv & 0x80) === 0) {
      return 1.0
    } else {
      const volume = this.regs[Reg.VOLUME_ENVELOPE] & 0x3f
      return volume * (1.0 / 0x3f)
    }
  }

  public getFrequency(): number {
    // 7  bit  0  (write)
    // ---- ----
    // FFFF FFFF
    // |||| ||||
    // ++++-++++- Bits 0-7 of frequency

    // 7  bit  0  (write)
    // ---- ----
    // MExx FFFF
    // ||   ||||
    // ||   ++++- Bits 8-11 of frequency
    // |+-------- Disable volume and sweep envelopes (but not modulation)
    // +--------- When enabled, envelopes run 4x faster. Also stops the mod table accumulator.

    // 7  bit  0  (write; read through $4092)
    // ---- ----
    // MDSS SSSS
    // |||| ||||
    // ||++-++++- (M=0) Mod envelope speed
    // ||         (M=1) Mod gain and envelope speed.
    // |+-------- Mod envelope direction (0: decrease; 1: increase)
    // +--------- Mod envelope mode (0: on; 1: off)

    // const e = this.regs[Reg.MOD_ENVELOPE] & 0x3f
    // const m = this.regs[Reg.ENVELOPE_SPEED]


    // c = CPU clocks per tick
    // e = envelope speed ($4080/4084)
    // m = master envelope speed ($408A)
    // c =  8 * (e + 1) * (m + 1)
    // const c = 8 * (e + 1)  // * (m + 1)

    // f = frequency of tick
    // n = CPU clock rate (≈1789773 Hz)
    // f = n / c

    // f = frequency of tick
    // n = CPU clock rate (≈1789773 Hz)
    // p = current pitch value ($4082/$4083 or $4086/$4087) plus modulation if wave output
    const p = this.regs[Reg.FREQUENCY_LOW] | ((this.regs[Reg.FREQUENCY_HIGH] & 0x0f) << 8)
    // const f = (1789773 * p) >> 16
    const f = (1789773 * p) >> 21
    return Math.max(f, 1)
  }

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

  public getDutyRatio(): number {
    return 0.5
  }
}

export class FdsAudio {
  private waveform = new Uint8Array(0x40)

  private channels = new Array<FdsChannel>(kWaveTypes.length)

  public constructor() {
    for (let i = 0; i < this.channels.length; ++i) {
      const type = kWaveTypes[i]
      let channel: FdsChannel
      switch (type) {
      case WaveType.PULSE:
        channel = new FdsChannel()
        break
      default:
        continue
      }
      this.channels[i] = channel
    }
  }

  public getExtraChannelWaveTypes(): WaveType[]|null {
    return kWaveTypes
  }

  public getSoundChannel(ch: number): IChannel {
    return this.channels[ch]
  }

  public read(_adr: Address): Byte {
    return 0
  }

  public write(adr: Address, value: Byte): void {
    if (0x4040 <= adr && adr < 0x4080) {
      // Waveform
      this.waveform[adr - 0x4040] = value
    } else {
      this.channels[0].write((adr - 0x4080) as Reg, value)
    }
  }
}
