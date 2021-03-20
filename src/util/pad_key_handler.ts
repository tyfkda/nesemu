import {PadValue} from '../nes/apu'
import {KeyboardManager} from './keyboard_manager'

const kKeyTable = [
  [
    {key: 'KeyX',        bit: PadValue.A},
    {key: 'KeyZ',        bit: PadValue.B},
    {key: 'Space',       bit: PadValue.SELECT},
    {key: 'Enter',       bit: PadValue.START},
    {key: 'ArrowUp',     bit: PadValue.U},
    {key: 'ArrowDown',   bit: PadValue.D},
    {key: 'ArrowLeft',   bit: PadValue.L},
    {key: 'ArrowRight',  bit: PadValue.R},
  ],
  [
    {key: 'KeyW',      bit: PadValue.A},
    {key: 'KeyQ',      bit: PadValue.B},
    {key: 'KeyO',      bit: PadValue.SELECT},
    {key: 'KeyP',      bit: PadValue.START},
    {key: 'KeyI',      bit: PadValue.U},
    {key: 'KeyK',      bit: PadValue.D},
    {key: 'KeyJ',      bit: PadValue.L},
    {key: 'KeyL',      bit: PadValue.R},
  ],
]

export class PadKeyHandler {
  private status = new Uint8Array(2)

  public static getMapping(padNo: number): {key: string; bit: PadValue}[] {
    return kKeyTable[padNo]
  }

  public getStatus(padNo: number): number {
    return this.status[padNo]
  }

  public clearAll(): void {
    this.status.fill(0)
  }

  public update(keyboardManager: KeyboardManager): void {
    for (let padNo = 0; padNo < 2; ++padNo) {
      const table = kKeyTable[padNo]
      let state = 0
      for (let i = 0; i < table.length; ++i) {
        if (keyboardManager.getKeyPressing(table[i].key))
          state |= table[i].bit
      }
      this.status[padNo] = state
    }
  }
}
