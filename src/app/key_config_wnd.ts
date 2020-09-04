import DomUtil from '../util/dom_util'
import GamepadManager from '../util/gamepad_manager'
import {PadBit} from '../nes/apu'
import PadKeyHandler from '../util/pad_key_handler'
import StorageUtil from '../util/storage_util'
import WindowManager from '../wnd/window_manager'
import Wnd from '../wnd/wnd'
import {WndEvent} from '../wnd/types'

import * as escape from 'escape-html'

interface GamepadButtonOption {
  width?: number
  height?: number
  type?: 'round'
}

interface GamepadButtonDef {
  x: number
  y: number
  padbit: number
  opt?: GamepadButtonOption
}

const kGamepadButtons: GamepadButtonDef[] = [
  {x: 175, y:  40, padbit: PadBit.A, opt: {type: 'round'}},
  {x: 130, y:  40, padbit: PadBit.B, opt: {type: 'round'}},
  {x:  50, y: 110, padbit: PadBit.SELECT, opt: {width: 60, height: 20}},
  {x: 120, y: 110, padbit: PadBit.START, opt: {width: 60, height: 20}},
  {x:  40, y:  10, padbit: PadBit.U},
  {x:  40, y:  70, padbit: PadBit.D},
  {x:  10, y:  40, padbit: PadBit.L},
  {x:  70, y:  40, padbit: PadBit.R},
]

abstract class GamepadBaseWnd extends Wnd {
  private buttons: HTMLElement[]
  private selectedButton: HTMLElement | null = null

  private static createButton(parent: HTMLElement, x: number, y: number, name: string,
                              opt: GamepadButtonOption = {}): HTMLElement
  {
    const btn = document.createElement('div')
    btn.className = 'gamepad-btn'
    DomUtil.setStyles(btn, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${opt.width || 30}px`,
      height: `${opt.height || 30}px`,
      overflow: 'hidden',
    })
    btn.innerHTML = name
    if (opt.type === 'round')
      btn.style.borderRadius = '15px'
    parent.appendChild(btn)
    return btn
  }

  public constructor(
      wndMgr: WindowManager, title: string, labels: string[],
      private onClose?: () => void,
  ) {
    super(wndMgr, 230, 150, title)
    const content = document.createElement('div')
    content.className = 'gamepad-content'
    DomUtil.setStyles(content, {
      width: '230px',
      height: '150px',
    })
    this.setContent(content)

    content.addEventListener('click', () => {
      this.setSelectedButton(null)
    })

    this.buttons = kGamepadButtons.map(d => {
      const label = labels[d.padbit]
      const btn = GamepadBaseWnd.createButton(content, d.x, d.y, label, d.opt)
      btn.addEventListener('click', event => {
        event.stopPropagation()
        this.setSelectedButton(btn)
      })
      return btn
    })
    this.selectedButton = null
  }

  public close(): void {
    if (this.onClose != null)
      this.onClose()
    super.close()
  }

  public onEvent(event: WndEvent, _param?: any): any {
    switch (event) {
    case WndEvent.UPDATE_FRAME:
      this.updateGamepad()
      break
    default:
      break
    }
  }

  protected updateButtonLabels(labels: string[]): void {
    for (let i = 0; i < this.buttons.length; ++i) {
      const button = this.buttons[i]
      button.innerHTML = labels[i]
    }
  }

  protected abstract checkGamepad(): number

  protected abstract modifyButton(buttonIndex: number): boolean

  private updateGamepad(): void {
    if (this.selectedButton != null && this.isTop()) {
      const buttonIndex = this.buttons.indexOf(this.selectedButton)
      if (this.modifyButton(buttonIndex))
        this.setSelectedButton(null)
    }

    const pad = this.checkGamepad()
    this.updateGamepadPressed(pad)
  }

  private updateGamepadPressed(pad: number) {
    for (let i = 0; i < kGamepadButtons.length; ++i) {
      const button = this.buttons[i]
      if ((pad & (1 << kGamepadButtons[i].padbit)) === 0) {
        button.classList.remove('pressed')
      } else {
        button.classList.add('pressed')
      }
    }
  }

  private setSelectedButton(btn: HTMLElement | null): void {
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

// ================================================
// Config window.

const kGamepadLabels: string[] = [
  'A',       // PadBit.A
  'B',       // PadBit.B
  'Select',  // PadBit.SELECT
  'Start',   // PadBit.START
  '&uarr;',  // PadBit.U
  '&darr;',  // PadBit.D
  '&larr;',  // PadBit.L
  '&rarr;',  // PadBit.R
]

export class GamepadWnd extends GamepadBaseWnd {
  public constructor(wndMgr: WindowManager, onClose?: () => void) {
    super(wndMgr, 'Gamepad Config', kGamepadLabels, onClose)
    wndMgr.add(this)
  }

  protected checkGamepad(): number {
    const padNo = 0
    const gamepad = this.getGamepad(padNo)
    if (!gamepad || this.wndMgr.isBlur())
      return 0
    return GamepadManager.getState(padNo)
  }

  protected modifyButton(buttonIndex: number): boolean {
    const padNo = 0
    const gamepad = this.getGamepad(padNo)
    if (!gamepad)
      return false

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

  private getGamepad(padNo: number): Gamepad|null {
    if (!window.Gamepad)
      return null
    const gamepads = navigator.getGamepads()
    if (padNo >= gamepads.length)
      return null
    return gamepads[padNo]
  }
}

const kKeyLabels: {[key: string]: string} = (() => {
  const table: Record<string, string> = {
    ArrowUp: '&uarr;',
    ArrowDown: '&darr;',
    ArrowLeft: '&larr;',
    ArrowRight: '&rarr;',
    Period: '.',
    Comma: ',',
    Slash: '/',
    Semicolon: ';',
    Quote: '\'',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    ControlLeft: 'CtrlL',
    ControlRight: 'CtrlR',
    ShiftLeft: 'ShiftL',
    ShiftRight: 'ShiftR',
    AltLeft: 'AltL',
    AltRight: 'AltR',
    MetaLeft: 'MetaL',
    MetaRight: 'MetaR',
  }
  for (let i = 'A'.charCodeAt(0); i <= 'Z'.charCodeAt(0); ++i) {
    const chr = String.fromCharCode(i)
    table[`Key${chr}`] = chr
  }
  for (let i = 0; i <= 9; ++i)
    table[`Digit${i}`] = i.toString()
  return table
})()

export class KeyConfigWnd extends GamepadBaseWnd {
  public static loadSetting() {
    const data = StorageUtil.getObject('keymap', null)
    if (Array.isArray(data)) {
      for (let padNo = 0; padNo < 2; ++padNo) {
        if (padNo >= data.length || !Array.isArray(data[padNo]))
          break
        const table = PadKeyHandler.getMapping(padNo)
        for (let i = 0; i < data[padNo].length; ++i) {
          const index = table.findIndex(t => t.bit === (1 << i))
          if (index >= 0)
            table[index].key = data[padNo][i]
        }
      }
    }
  }

  private static saveSetting() {
    const data = new Array<(string | null)[]>(2)
    for (let padNo = 0; padNo < 2; ++padNo) {
      const table = PadKeyHandler.getMapping(padNo)
      const mapping: (string | null)[] = [...Array(8).keys()].map(i => {
        const index = table.findIndex(t => t.bit === (1 << i))
        return index >= 0 ? table[index].key : null
      })
      data[padNo] = mapping
    }
    StorageUtil.putObject('keymap', data)
  }

  public constructor(wndMgr: WindowManager, onClose?: () => void) {
    super(wndMgr, 'Key Config', kGamepadLabels, onClose)
    this.updateLabels()
    wndMgr.add(this)
  }

  protected checkGamepad(): number {
    const padNo = 0
    const keyboardManager = this.wndMgr.getKeyboardManager()
    const table = PadKeyHandler.getMapping(padNo)
    let state = 0
    for (let i = 0; i < table.length; ++i) {
      if (keyboardManager.getKeyPressing(table[i].key))
        state |= table[i].bit
    }
    return state
  }

  protected modifyButton(buttonIndex: number): boolean {
    const keyboardManager = this.wndMgr.getKeyboardManager()
    const key = keyboardManager.getLastPressing()
    if (!key)
      return false

    const padNo = 0
    const button = kGamepadButtons[buttonIndex]
    const table = PadKeyHandler.getMapping(padNo)
    for (let i = 0; i < table.length; ++i) {
      const index = table.findIndex(t => t.bit === (1 << button.padbit))
      if (index >= 0) {
        table[index].key = key
        this.updateLabels()
        KeyConfigWnd.saveSetting()
        return true
      }
    }

    return false
  }

  private updateLabels(): void {
    const padNo = 0
    const table = PadKeyHandler.getMapping(padNo)
    const labels = table.map(t => {
      if (t.key in kKeyLabels)
        return kKeyLabels[t.key]
      return escape(t.key)
    })
    super.updateButtonLabels(labels)
  }
}
