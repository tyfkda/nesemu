// APU: Audio Processing Unit

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
const STATUS_REG = 0x4015
const PAD1_REG = 0x4016
const PAD2_REG = 0x4017
const FRAME_COUNTER = 0x4017
const IRQ_INHIBIT = 1 << 6
const SEQUENCER_MODE = 1 << 7

const CONSTANT_VOLUME = 0x10
const LENGTH_COUNTER_HALT = 0x20

const kLengthTable = [
  0x0a, 0xfe, 0x14, 0x02, 0x28, 0x04, 0x50, 0x06, 0xa0, 0x08, 0x3c, 0x0a, 0x0e, 0x0c, 0x1a, 0x0e,
  0x0c, 0x10, 0x18, 0x12, 0x30, 0x14, 0x60, 0x16, 0xc0, 0x18, 0x48, 0x1a, 0x10, 0x1c, 0x20, 0x1e,
]

const kNoiseFrequencies = (
  [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068]
    .map(v => v * 1))

const VBLANK_START = 241

// ================================================================
// GamePad
class GamePad {
  private status = new Array<number>(2)
  private tmp = new Array<number>(2)

  public setStatus(no: number, status: number): void {
    this.status[no] = status
  }

  public latch(): void {
    this.tmp[0] = this.status[0]
    this.tmp[1] = this.status[1]
  }

  public shift(no: number): number {
    const result = this.tmp[no]
    this.tmp[no] = result >> 1
    return result & 1
  }
}

// ================================================================
// Apu
export class Apu {
  public static CHANNEL = 4

  private regs = new Uint8Array(0x20)
  private frameInterrupt = 0  // 0=not occurred, 0x40=occurred
  private dmcInterrupt = 0x80  // 0=not occurred, 0x80=occurred
  private lengthCounter = new Array<number>(Apu.CHANNEL)
  private channelStopped = new Array<boolean>(Apu.CHANNEL)
  private gamePad = new GamePad()

  constructor(private triggerIrq: () => void) {
  }

  public reset() {
    this.regs.fill(0)
    this.regs[FRAME_COUNTER - BASE] = IRQ_INHIBIT
    this.frameInterrupt = 0
    this.dmcInterrupt = 0x80  // TODO: Implement

    this.lengthCounter.fill(0)
    this.channelStopped.fill(true)
  }

  public read(adr: number): number {
    switch (adr) {
    case STATUS_REG:
      {
        // TODO: Implement.
        let result = this.dmcInterrupt | this.frameInterrupt
        for (let ch = 0; ch < Apu.CHANNEL; ++ch) {
          if (this.lengthCounter[ch] > 0)
            result |= 1 << ch
        }

        // Reading this register clears the frame interrupt flag (but not the DMC interrupt flag).
        this.frameInterrupt = 0
        return result
      }
    case PAD1_REG:
    case PAD2_REG:
      return this.gamePad.shift(adr - PAD1_REG)
    default:
      return 0
    }
  }

  public write(adr: number, value: number): void {
    if (adr < 0x4020) {
      this.regs[adr - 0x4000] = value

      if (adr < 0x4010) {  // Sound
        const ch = (adr - 0x4000) >> 2
        if ((adr & 3) === 3) {  // Set length.
          const length = kLengthTable[value >> 3]
          this.lengthCounter[ch] = length
          this.channelStopped[ch] = false
        }
      }
    }

    switch (adr) {
    case STATUS_REG:
      this.dmcInterrupt = 0  // Writing to this register clears the DMC interrupt flag.
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

  public getFrequency(channel: number): number {
    switch (channel) {
    case 0:
    case 1:
      {
        const value = this.regs[channel * 4 + 2] + ((this.regs[channel * 4 + 3] & 7) << 8)
        return ((1790000 / 16) / (value + 1)) | 0
      }
    case 2:
      {
        const value = this.regs[channel * 4 + 2] + ((this.regs[channel * 4 + 3] & 7) << 8)
        return ((1790000 / 8) / (value + 1)) | 0
      }
    case 3:
      {
        const period = this.regs[channel * 4 + 2] & 15
        return kNoiseFrequencies[period]
      }
    default:
      break
    }
  }

  public getVolume(channel: number): number {
    if ((this.regs[0x15] & (1 << channel)) === 0 ||
       this.channelStopped[channel])
      return 0

    let v = this.regs[channel * 4]

    switch (channel) {
    case 0:
    case 1:
    case 3:
      {
        if ((v & CONSTANT_VOLUME) !== 0)
          return (v & 15) / 15.0
        return 1
      }
    case 2:
      return 1.0
    default:
      break
    }
    return 0.0
  }

  public setPadStatus(no: number, status: number): void {
    this.gamePad.setStatus(no, status)
  }

  public onHblank(hcount: number): void {
    switch (hcount) {
    case VBLANK_START:
      this.updateVolumes()
      if (this.isIrqEnabled()) {
        this.frameInterrupt = 0x40
        this.triggerIrq()
      }
      break
    default:
      break
    }
  }

  private updateVolumes(): void {
    for (let ch = 0; ch < Apu.CHANNEL; ++ch) {
      if ((this.regs[0x15] & (1 << ch)) === 0 ||
          this.channelStopped[ch])
        continue

      let l = this.lengthCounter[ch]
      let v = this.regs[ch * 4]
      if ((v & LENGTH_COUNTER_HALT) === 0) {
        this.lengthCounter[ch] = l -= 2
        if (l <= 0) {
          this.regs[ch * 4] = v = (v & 0xf0)  // Set volume = 0
          this.lengthCounter[ch] = 0
          this.channelStopped[ch] = true
        }
      }
    }
  }

  private isIrqEnabled(): boolean {
    // http://wiki.nesdev.com/w/index.php/IRQ
    // Enable: $4017 write with bits 7-6 = 00
    return (this.regs[FRAME_COUNTER - BASE] & (IRQ_INHIBIT | SEQUENCER_MODE)) === 0
  }
}
