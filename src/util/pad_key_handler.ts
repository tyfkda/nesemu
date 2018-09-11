import {PadValue} from '../nes/apu'
import {KeyCode} from './key_code'

const kKeyTable: {[key: number]: {no: number, bit: number}} = {
  [KeyCode.LEFT]: {no: 0, bit: PadValue.L},
  [KeyCode.RIGHT]: {no: 0, bit: PadValue.R},
  [KeyCode.UP]: {no: 0, bit: PadValue.U},
  [KeyCode.DOWN]: {no: 0, bit: PadValue.D},
  [KeyCode.Z]: {no: 0, bit: PadValue.B},
  [KeyCode.X]: {no: 0, bit: PadValue.A},
  [KeyCode.SPACE]: {no: 0, bit: PadValue.SELECT},
  [KeyCode.RETURN]: {no: 0, bit: PadValue.START},

  [KeyCode.J]: {no: 1, bit: PadValue.L},
  [KeyCode.L]: {no: 1, bit: PadValue.R},
  [KeyCode.I]: {no: 1, bit: PadValue.U},
  [KeyCode.K]: {no: 1, bit: PadValue.D},
  [KeyCode.Q]: {no: 1, bit: PadValue.B},
  [KeyCode.W]: {no: 1, bit: PadValue.A},
  [KeyCode.O]: {no: 1, bit: PadValue.SELECT},
  [KeyCode.P]: {no: 1, bit: PadValue.START},
}

export class PadKeyHandler {
  private controller: number[] = [0, 0]

  public onKeyDown(keyCode: KeyCode): void {
    const c = kKeyTable[keyCode]
    if (!c)
      return
    this.controller[c.no] |= c.bit
  }

  public onKeyUp(keyCode: KeyCode): void {
    const c = kKeyTable[keyCode]
    if (!c)
      return
    this.controller[c.no] &= ~c.bit
  }

  public getStatus(no: number): number {
    return this.controller[no]
  }
}
