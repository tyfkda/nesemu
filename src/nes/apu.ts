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

export class Apu {
  private padStatus: number[] = new Array(2)
  private padTmp: number[] = new Array(2)

  public read(adr: number): number {
    switch (adr) {
    case 0x4016:  // Pad 1
    case 0x4017:  // Pad 2
      return this.shiftPad(adr - 0x4016)
    default:
      return 0
    }
  }

  public write(adr: number, value: number): void {
    switch (adr) {
    case 0x4016:  // Pad status. bit0 = Controller shift register strobe
      if ((value & 1) === 0) {
        this.latchPad()
      }
      break
    default:
      break
    }
  }

  public setPadStatus(no: number, status: number): void {
    this.padStatus[no] = status
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
