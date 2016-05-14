import {PadBit} from './nes/pad.ts'

enum KeyCode {
  SPACE = 32,
  RETURN = 13,
  LEFT = 37,
  UP = 38,
  RIGHT = 39,
  DOWN = 40,
  Z = 90,
  X = 88,
}

const kKeyTable = (() => {
  const t = {}
  t[KeyCode.LEFT] = PadBit.L
  t[KeyCode.RIGHT] = PadBit.R
  t[KeyCode.UP] = PadBit.U
  t[KeyCode.DOWN] = PadBit.D
  t[KeyCode.Z] = PadBit.A
  t[KeyCode.X] = PadBit.B
  t[KeyCode.SPACE] = PadBit.SELECT
  t[KeyCode.RETURN] = PadBit.START
  return t
})()

export class PadKeyHandler {
  private pad: number = 0

  public onKeyDown(keyCode): void {
    const c = kKeyTable[keyCode]
    if (!c)
      return
    this.pad |= c
  }

  public onKeyUp(keyCode): void {
    const c = kKeyTable[keyCode]
    if (!c)
      return
    this.pad &= ~c
  }

  public getStatus(): number {
    return this.pad
  }
}
