import {PadBit} from '../nes/apu'
import WindowManager from '../wnd/window_manager'
import Wnd from '../wnd/wnd'
import StorageUtil from '../util/storage_util'
import Util from '../util/util'

// Type
const enum Type {
  AXIS,
  BUTTON,
}

const kKeyTable: string[] = ['A', 'B', 'SELECT', 'START', 'U', 'D', 'L', 'R']

// ================================================
// Manager.

export class GamepadManager {
  public static AXIS_THRESHOLD = 0.5

  private static initialized = false
  private static padSettings: {type: Type, index: number, direction: number}[] = [
    { type: Type.BUTTON, index: 0, direction: 1 },  // A
    { type: Type.BUTTON, index: 1, direction: 1 },  // B
    { type: Type.BUTTON, index: 2, direction: 1 },  // SELECT
    { type: Type.BUTTON, index: 3, direction: 1 },  // START
    { type: Type.AXIS, index: 1, direction: -1  },  // U
    { type: Type.AXIS, index: 1, direction: 1  },  // D
    { type: Type.AXIS, index: 0, direction: -1  },  // L
    { type: Type.AXIS, index: 0, direction: 1  },  // R
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
        const axis = gamepad.axes[s.index] || 0
        if (axis * s.direction >= THRESHOLD)
          pad |= 1 << i
        break
      case Type.BUTTON:
        const button = gamepad.buttons[s.index]
        if (button && button.pressed)
          pad |= 1 << i
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
    const data = {}
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

// ================================================
// Config window.

interface GamepadButtonDef {
  x: number
  y: number
  name: string
  padbit: number
  opt?: any
}

const kGamepadButtons: GamepadButtonDef[] = [
  { x: 40, y: 10, name: '&uarr;', padbit: PadBit.U },
  { x: 10, y: 40, name: '&larr;', padbit: PadBit.L },
  { x: 70, y: 40, name: '&rarr;', padbit: PadBit.R },
  { x: 40, y: 70, name: '&darr;', padbit: PadBit.D },
  { x: 130, y: 40, name: 'B', opt: {type: 'round'}, padbit: PadBit.B },
  { x: 175, y: 40, name: 'A', opt: {type: 'round'}, padbit: PadBit.A },
  { x: 50, y: 110, name: 'Select', opt: {width: 60, height: 20}, padbit: PadBit.SELECT },
  { x: 120, y: 110, name: 'Start', opt: {width: 60, height: 20}, padbit: PadBit.START },
]

function createButton(parent: HTMLElement, x: number, y: number, name: string,
                      opt: any = {}): HTMLElement
{
  const btn = document.createElement('div')
  btn.className = 'gamepad-btn'
  Util.setStyles(btn, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${opt.width || 30}px`,
    height: `${opt.height || 30}px`,
  })
  btn.innerHTML = name
  if (opt.type === 'round')
    btn.style.borderRadius = '15px'
  parent.appendChild(btn)
  return btn
}

export class GamepadWnd extends Wnd {
  private destroying = false
  private buttons: HTMLElement[]
  private selectedButton: HTMLElement|null = null

  public constructor(wndMgr: WindowManager) {
    super(wndMgr, 230, 150, 'Gamepad config')
    const content = document.createElement('div')
    content.className = 'gamepad-content'
    Util.setStyles(content, {
      width: '230px',
      height: '150px',
    })
    this.setContent(content)

    content.addEventListener('click', () => {
      this.setSelectedButton(null)
    })

    this.buttons = kGamepadButtons.map(d => {
      const btn = createButton(content, d.x, d.y, d.name, d.opt)
      btn.addEventListener('click', (event) => {
        event.stopPropagation()
        this.setSelectedButton(btn)
      })
      return btn
    })
    this.selectedButton = null

    const loopFn = () => {
      if (this.destroying)
        return
      this.checkGamepad()
      requestAnimationFrame(loopFn)
    }
    requestAnimationFrame(loopFn)
  }

  public close(): void {
    this.destroying = true
    super.close()
  }

  private checkGamepad(): void {
    const padNo = 0
    if (!window.Gamepad)
      return
    const gamepads = navigator.getGamepads()
    if (padNo >= gamepads.length)
      return
    const gamepad = gamepads[padNo]
    if (!gamepad)
      return

    if (this.selectedButton != null && this.isTop()) {
      const buttonIndex = this.buttons.indexOf(this.selectedButton)
      if (this.replaceGamepadButton(padNo, gamepad, buttonIndex))
        this.setSelectedButton(null)
    }
    this.checkGamepadPressed(padNo)
  }

  private replaceGamepadButton(_padNo: number, gamepad: Gamepad, buttonIndex: number): boolean {
    for (let i = 0; i < gamepad.buttons.length; ++i) {
      if (gamepad.buttons[i].pressed) {
        GamepadManager.setButton(kGamepadButtons[buttonIndex].padbit, i)
        return true
      }
    }

    const THRESHOLD = GamepadManager.AXIS_THRESHOLD
    for (let i = 0; i < gamepad.axes.length; ++i) {
      const v = gamepad.axes[i]
      if (v < -THRESHOLD) {
        GamepadManager.setAxis(kGamepadButtons[buttonIndex].padbit, i, -1)
        return true
      }
      if (v > THRESHOLD) {
        GamepadManager.setAxis(kGamepadButtons[buttonIndex].padbit, i, 1)
        return true
      }
    }
    return false
  }

  private checkGamepadPressed(padNo: number) {
    const pad = GamepadManager.getState(padNo)
    for (let i = 0; i < kGamepadButtons.length; ++i) {
      const button = this.buttons[i]
      if ((pad & (1 << kGamepadButtons[i].padbit)) === 0) {
        button.classList.remove('pressed')
      } else {
        button.classList.add('pressed')
      }
    }
  }

  private setSelectedButton(btn: HTMLElement|null): void {
    if (this.selectedButton != null) {
      this.selectedButton.classList.remove('selected')
    }
    if (this.selectedButton === btn) {
      this.selectedButton = null
      return
    }

    this.selectedButton = btn
    if (this.selectedButton != null) {
      this.selectedButton.classList.add('selected')
    }
  }
}
