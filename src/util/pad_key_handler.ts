import {PadValue} from '../nes/apu'
import {KeyCode} from './key_code'

const kKeyTable: {[key: number]: {no: number, bit: number}} = (() => {
  const t: {[key: number]: {no: number, bit: number}} = {}
  t[KeyCode.LEFT] = {no: 0, bit: PadValue.L}
  t[KeyCode.RIGHT] = {no: 0, bit: PadValue.R}
  t[KeyCode.UP] = {no: 0, bit: PadValue.U}
  t[KeyCode.DOWN] = {no: 0, bit: PadValue.D}
  t[KeyCode.Z] = {no: 0, bit: PadValue.B}
  t[KeyCode.X] = {no: 0, bit: PadValue.A}
  t[KeyCode.SPACE] = {no: 0, bit: PadValue.SELECT}
  t[KeyCode.RETURN] = {no: 0, bit: PadValue.START}

  t[KeyCode.J] = {no: 1, bit: PadValue.L}
  t[KeyCode.L] = {no: 1, bit: PadValue.R}
  t[KeyCode.I] = {no: 1, bit: PadValue.U}
  t[KeyCode.K] = {no: 1, bit: PadValue.D}
  t[KeyCode.Q] = {no: 1, bit: PadValue.B}
  t[KeyCode.W] = {no: 1, bit: PadValue.A}
  t[KeyCode.O] = {no: 1, bit: PadValue.SELECT}
  t[KeyCode.P] = {no: 1, bit: PadValue.START}
  return t
})()

export class PadKeyHandler {
  private controller: number[] = [0, 0]

  public onKeyDown(keyCode: number): void {
    const c = kKeyTable[keyCode]
    if (!c)
      return
    this.controller[c.no] |= c.bit
  }

  public onKeyUp(keyCode: number): void {
    const c = kKeyTable[keyCode]
    if (!c)
      return
    this.controller[c.no] &= ~c.bit
  }

  public getStatus(no: number): number {
    return this.controller[no]
  }
}
