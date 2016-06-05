import {PadBit} from '../nes/apu.ts'

enum KeyCode {
  // Controller 1
  SPACE = 32,
  RETURN = 13,
  LEFT = 37,
  UP = 38,
  RIGHT = 39,
  DOWN = 40,
  Z = 90,
  X = 88,

  // Controller 2
  I = 73,
  J = 74,
  K = 75,
  L = 76,
  Q = 81,
  W = 87,
  O = 79,
  P = 80,
}

const kKeyTable = (() => {
  const t = {}
  t[KeyCode.LEFT] = {no: 0, bit: PadBit.L}
  t[KeyCode.RIGHT] = {no: 0, bit: PadBit.R}
  t[KeyCode.UP] = {no: 0, bit: PadBit.U}
  t[KeyCode.DOWN] = {no: 0, bit: PadBit.D}
  t[KeyCode.Z] = {no: 0, bit: PadBit.B}
  t[KeyCode.X] = {no: 0, bit: PadBit.A}
  t[KeyCode.SPACE] = {no: 0, bit: PadBit.SELECT}
  t[KeyCode.RETURN] = {no: 0, bit: PadBit.START}

  t[KeyCode.J] = {no: 1, bit: PadBit.L}
  t[KeyCode.L] = {no: 1, bit: PadBit.R}
  t[KeyCode.I] = {no: 1, bit: PadBit.U}
  t[KeyCode.K] = {no: 1, bit: PadBit.D}
  t[KeyCode.Q] = {no: 1, bit: PadBit.B}
  t[KeyCode.W] = {no: 1, bit: PadBit.A}
  t[KeyCode.O] = {no: 1, bit: PadBit.SELECT}
  t[KeyCode.P] = {no: 1, bit: PadBit.START}
  return t
})()

export class PadKeyHandler {
  private controller: number[] = [0, 0]

  public onKeyDown(keyCode): void {
    const c = kKeyTable[keyCode]
    if (!c)
      return
    this.controller[c.no] |= c.bit
  }

  public onKeyUp(keyCode): void {
    const c = kKeyTable[keyCode]
    if (!c)
      return
    this.controller[c.no] &= ~c.bit
  }

  public getStatus(no: number): number {
    return this.controller[no]
  }
}
