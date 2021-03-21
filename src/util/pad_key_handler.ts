import {PadValue} from '../nes/apu'
import {KeyboardManager} from './keyboard_manager'
import {StorageUtil} from '../util/storage_util'

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

    {key: 'KeyS',        bit: PadValue.REPEAT_A},
    {key: 'KeyA',        bit: PadValue.REPEAT_B},
  ],
  [
    {key: 'KeyH',      bit: PadValue.A},
    {key: 'KeyG',      bit: PadValue.B},
    {key: 'KeyO',      bit: PadValue.SELECT},
    {key: 'KeyP',      bit: PadValue.START},
    {key: 'KeyI',      bit: PadValue.U},
    {key: 'KeyK',      bit: PadValue.D},
    {key: 'KeyJ',      bit: PadValue.L},
    {key: 'KeyL',      bit: PadValue.R},
  ],
]

export class PadKeyHandler {
  private status = new Uint16Array(2)

  public static setUp(): void {
    PadKeyHandler.loadSetting()
  }

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
        const elem = table[i]
        if (keyboardManager.getKeyPressing(elem.key))
          state |= elem.bit
      }
      this.status[padNo] = state
    }
  }

  public static saveSetting(): void {
    const data = new Array<(string | null)[]>(2)
    for (let padNo = 0; padNo < 2; ++padNo) {
      const table = PadKeyHandler.getMapping(padNo)
      const mapping: (string | null)[] = [...Array(table.length).keys()].map(i => {
        const index = table.findIndex(t => t.bit === 1 << i)
        return index >= 0 ? table[index].key : null
      })
      data[padNo] = mapping
    }
    StorageUtil.putObject('keymap', data)
  }

  private static loadSetting(): void {
    const data = StorageUtil.getObject('keymap', null)
    if (Array.isArray(data)) {
      for (let padNo = 0; padNo < 2; ++padNo) {
        if (padNo >= data.length || !Array.isArray(data[padNo]))
          break
        const table = PadKeyHandler.getMapping(padNo)
        for (let i = 0; i < data[padNo].length; ++i) {
          const index = table.findIndex(t => t.bit === 1 << i)
          if (index >= 0)
            table[index].key = data[padNo][i]
        }
      }
    }
  }
}
