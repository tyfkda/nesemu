// APU: Audio Processing Unit

import {Util} from './util.ts'

export enum PadBit {
  A = 1 << 0,
  B = 1 << 1,
  SELECT = 1 << 2,
  START = 1 << 3,
  U = 1 << 4,
  D = 1 << 5,
  L = 1 << 6,
  R = 1 << 7,
}

const BASE = 0x4000
const STATUS_REG = 0x4015
const PAD1_REG = 0x4016
const PAD2_REG = 0x4017
const FRAME_COUNTER = 0x4017
const IRQ_INHIBIT = 1 << 6
const SEQUENCER_MODE = 1 << 7

export class Apu {
  private padStatus: number[] = new Array(2)
  private padTmp: number[] = new Array(2)
  private regs: Uint8Array = new Uint8Array(0x20)
  private frameInterrupt: number  // 0=not occurred, 0x40=occurred
  private dmcInterrupt: number  // 0=not occurred, 0x80=occurred

  public reset() {
    this.regs.fill(0)
    this.regs[FRAME_COUNTER - BASE] = IRQ_INHIBIT
    this.frameInterrupt = 0
    this.dmcInterrupt = 0x80  // TODO: Implement
  }

  public read(adr: number): number {
    switch (adr) {
    case STATUS_REG:
      {
        // TODO: Implement.
        const result = this.dmcInterrupt | this.frameInterrupt
        // Reading this register clears the frame interrupt flag (but not the DMC interrupt flag).
        this.frameInterrupt = 0
        return result
      }
    case PAD1_REG:
    case PAD2_REG:
      return this.shiftPad(adr - PAD1_REG)
    default:
      return 0
    }
  }

  public write(adr: number, value: number): void {
    if (adr < 0x4020) {
      this.regs[adr - 0x4000] = value
    }

    switch (adr) {
    case STATUS_REG:
      this.dmcInterrupt = 0  // Writing to this register clears the DMC interrupt flag.
      break
    case PAD1_REG:  // Pad status. bit0 = Controller shift register strobe
      if ((value & 1) === 0) {
        this.latchPad()
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
    default:
      break
    }
  }

  public getVolume(channel: number): number {
    if ((this.regs[0x15] & (1 << channel)) === 0)
      return 0

    switch (channel) {
    case 0:
    case 1:
      {
        const v = this.regs[channel * 4]
        //if ((v & (1 << 4)) !== 0)
        //  return 1.0  // TODO: Calculate from envelope.
        return (v & 15) / 15.0
      }
    case 2:
      return 1.0
    default:
      break
    }
  }

  public setPadStatus(no: number, status: number): void {
    this.padStatus[no] = status
  }

  public isIrqEnabled(): boolean {
    // http://wiki.nesdev.com/w/index.php/IRQ
    // Enable: $4017 write with bits 7-6 = 00
    return (this.regs[FRAME_COUNTER - BASE] & (IRQ_INHIBIT | SEQUENCER_MODE)) === 0
  }

  public setFrameInterrupt(): void {
    this.frameInterrupt = 0x40
  }

  private latchPad(): void {
    this.padTmp[0] = this.padStatus[0]
    this.padTmp[1] = this.padStatus[1]
  }

  private shiftPad(no: number): number {
    const result = this.padTmp[no]
    this.padTmp[no] = result >> 1
    return result & 1
  }
}
