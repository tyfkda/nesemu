// Family BASIC Keyboard

import {Address, Byte} from "../types"

export interface Peripheral {
  getIoMap(): Map<number, (adr: Address, value?: Byte) => any>
}

export const enum KeyType {
  F8, RETURN, LBRACKET, RBRACKET, KANA, RSHIFT, YEN, STOP,
  F7, ATMARK, COLON, SEMICOLON, UNDERSCORE, SLASH, MINUS, HAT,
  F6, O, L, K, PERIOD, COMMA, P, NUM0,
  F5, I, U, J, M, N, NUM9, NUM8,
  F4, Y, G, H, B, V, NUM7, NUM6,
  F3, T, R, D, F, C, NUM5, NUM4,
  F2, W, S, A, X, Z, E, NUM3,
  F1, ESC, Q, CTR, LSHIFT, GRPH, NUM1, NUM2,
  CLR_HOME, UP, RIGHT, LEFT, DOWN, SPACE, DEL, INS,
}

export class Keyboard implements Peripheral {
  private ioMap = new Map<number, (adr: Address, value?: Byte) => any>()
  private state = new Uint8Array(10 * 2)
  private rowcol = 0

  constructor() {
    this.clearAll()

    this.ioMap.set(0x4016, (_adr: Address, value?: Byte) => {
      if (value != null) {
        const prevcol = this.rowcol & 1
        const col = (value! >> 1) & 1
        this.rowcol = (this.rowcol & ~1) | col
        if (col === 0 && prevcol !== 0)  // High to low.
          this.rowcol = (this.rowcol + 2) % (10 * 2)
        if ((value! & 1) !== 0) {
          this.rowcol = 0
        }
      }
    })
    this.ioMap.set(0x4017, (_adr: Address, value?: Byte): any => {
      if (value == null) {
        const result = this.state[this.rowcol]
        this.rowcol += 1
        return result
      }
    })
  }

  public getIoMap(): Map<number, (adr: number, value?: Byte) => any> {
    return this.ioMap
  }

  public setKeyState(type: KeyType, pressed: boolean): void {
    const i = type >> 2
    const b = 2 << (type & 3)
    const s = this.state[i]
    this.state[i] = pressed ? (s & ~b) : (s | b)  // Pressed=>clear, not pressed=>set
  }

  public clearAll(): void {
    this.state.fill(0x1e)
  }
}
