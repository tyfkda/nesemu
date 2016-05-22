// APU: Audio Processing Unit

import {Pad} from './pad.ts'
import {Util} from './util.ts'

export class Apu {
  public pad: Pad

  constructor() {
    this.pad = new Pad()
  }

  public read(adr: number): number {
    switch (adr) {
    case 0x4016:  // Pad 1
    case 0x4017:  // Pad 2
      return this.pad.shift(adr - 0x4016)
    default:
      return 0
    }
  }

  public write(adr: number, value: number): void {
    switch (adr) {
    case 0x4016:  // Pad status. bit0 = Controller shift register strobe
      if ((value & 1) === 0) {
        this.pad.latch()
      }
      break
    default:
      break
    }
  }

  public setPadStatus(no: number, status: number): void {
    this.pad.setStatus(no, status)
  }
}
