import StorageUtil from '../util/storage_util'

// Type
const enum Type {
  AXIS,
  BUTTON,
}

const kKeyTable: string[] = ['A', 'B', 'SELECT', 'START', 'U', 'D', 'L', 'R']

// ================================================
// Manager.

export default class GamepadManager {
  public static AXIS_THRESHOLD = 0.5

  private static initialized = false
  private static padSettings: {type: Type; index: number; direction?: number}[] = [
    {type: Type.BUTTON, index: 0},  // A
    {type: Type.BUTTON, index: 1},  // B
    {type: Type.BUTTON, index: 2},  // SELECT
    {type: Type.BUTTON, index: 3},  // START
    {type: Type.AXIS, index: 1, direction: -1},  // U
    {type: Type.AXIS, index: 1, direction:  1},  // D
    {type: Type.AXIS, index: 0, direction: -1},  // L
    {type: Type.AXIS, index: 0, direction:  1},  // R
  ]

  public static setUp(): void {
    if (GamepadManager.initialized)
      return
    GamepadManager.loadSetting()
    GamepadManager.initialized = true
  }

  public static isSupported(): boolean {
    return 'Gamepad' in window
  }

  public static getState(padNo: number): number {
    if (!GamepadManager.isSupported())
      return 0
    const gamepads = navigator.getGamepads()
    if (padNo >= gamepads.length)
      return 0

    const gamepad = gamepads[padNo]
    if (!gamepad)
      return 0

    const THRESHOLD = GamepadManager.AXIS_THRESHOLD
    let pad = 0
    GamepadManager.padSettings.forEach((s, i) => {
      switch (s.type) {
      case Type.AXIS:
        {
          const axis = gamepad.axes[s.index] || 0
          if (axis * s.direction! >= THRESHOLD)
            pad |= 1 << i
        }
        break
      case Type.BUTTON:
        {
          const button = gamepad.buttons[s.index]
          if (button && button.pressed)
            pad |= 1 << i
        }
        break
      }
    })
    return pad
  }

  public static setButton(padbit: number, buttonIndex: number): void {
    GamepadManager.padSettings[padbit].type = Type.BUTTON
    GamepadManager.padSettings[padbit].index = buttonIndex
    GamepadManager.padSettings[padbit].direction = 1
    GamepadManager.saveSetting()
  }

  public static setAxis(padbit: number, axisIndex: number, direction: number): void {
    GamepadManager.padSettings[padbit].type = Type.AXIS
    GamepadManager.padSettings[padbit].index = axisIndex
    GamepadManager.padSettings[padbit].direction = direction
    GamepadManager.saveSetting()
  }

  private static saveSetting() {
    const data: {[key: string]: {button?: number; axis?: number; direction?: number}} = {}
    GamepadManager.padSettings.forEach((s, i) => {
      const key = kKeyTable[i]
      switch (s.type) {
      default:
        break
      case Type.BUTTON:
        data[key] = {
          button: s.index,
        }
        break
      case Type.AXIS:
        data[key] = {
          axis: s.index,
          direction: s.direction,
        }
        break
      }
    })
    StorageUtil.putObject('pad0', data)
  }

  private static loadSetting() {
    const data = StorageUtil.getObject('pad0', {})
    if (typeof data === 'object') {
      Object.keys(data).forEach(key => {
        const index = kKeyTable.indexOf(key.toUpperCase())
        if (index < 0)
          return
        const d = data[key]
        if ('button' in d) {
          GamepadManager.setButton(index, d.button)
        } else if ('axis' in d && 'direction' in d) {
          GamepadManager.setAxis(index, d.axis, parseInt(d.direction, 10))
        }
      })
    }
  }
}
