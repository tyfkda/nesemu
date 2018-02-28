///<reference path="./decl/patch.d.ts" />

import {App} from './app/app'
import {JsApp} from './app/js_powered_app'
import {GamepadManager, GamepadWnd} from './util/gamepad_manager'
import StorageUtil from './util/storage_util'
import Util from './util/util'
import WindowManager from './wnd/window_manager'
import './nes/polyfill'

// Request Animation Frame
window.requestAnimationFrame = (function() {
  return (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame || window.msRequestAnimationFrame)
})()

class Main {
  private wndMgr: WindowManager
  private apps: App[] = []

  constructor(private root: HTMLElement) {
    this.wndMgr = new WindowManager(root)

    this.setUpFileDrop()
    this.setUpGamePadLink()
    this.setUpOpenRomLink()
    this.setUpBlur()
  }

  private setUpFileDrop(): void {
    // Handle file drop.
    if (!(window.File && window.FileReader && window.FileList && window.Blob))
      return

    Util.handleFileDrop(this.root, (file, x, y) => {
      this.createAppFromFile(file, x, y)
    })
  }

  private createAppFromFile(file: File, x: number, y: number): void {
    switch (Util.getExt(file.name).toLowerCase()) {
    case 'nes':
      Util.loadFile(file)
        .then(binary => {
          this.createAppFromRom(binary, file.name, x, y)
        })
      break
    case 'zip':
      Util.loadFile(file)
        .then(binary => {
          return Util.unzip(binary)
        })
        .then(({unzipped, fileName}) => {
          this.createAppFromRom(unzipped, fileName, x, y)
        })
      break
    case 'js':
      {
        const jsApp = new JsApp(this.wndMgr, {title: file.name, centerX: x, centerY: y})
        jsApp.setFile(file)
        this.apps.push(jsApp)
      }
      break
    default:
      // TODO: Show error message.
      break
    }
  }

  private createAppFromRom(romData: Uint8Array, name: string, x: number, y: number): void {
    const title = name
    const option = {
      title,
      centerX: x,
      centerY: y,
      onClosed: (app) => {
        this.removeApp(app)
      },
    }
    const app = App.create(this.wndMgr, option)
    app.loadRom(romData)
    this.apps.push(app)
  }

  private removeApp(app): void {
    const index = this.apps.indexOf(app)
    if (index >= 0)
      this.apps.splice(index, 1)
  }

  private setUpGamePadLink(): void {
    const gamepadText = document.getElementById('gamepad')
    if (!GamepadManager.isSupported()) {
      gamepadText.style.display = 'none'
      return
    }

    gamepadText.addEventListener('click', () => {
      const gamepadWnd = new GamepadWnd(this.wndMgr)
      this.wndMgr.add(gamepadWnd)
    })
  }

  private setUpOpenRomLink(): void {
    const romFile = document.getElementById('rom-file') as HTMLInputElement
    romFile.addEventListener('change', () => {
      if (!romFile.value)
        return
      const fileList = romFile.files
      if (!fileList)
        return
      for (let i = 0; i < fileList.length; ++i) {
        this.createAppFromFile(fileList[i], 0, 0)
      }

      // Clear.
      romFile.value = ''
    })
  }

  private setUpBlur(): void {
    window.addEventListener('blur', () => {
      this.apps.forEach(app => { app.onBlur() })
    })
    window.addEventListener('focus', () => {
      this.apps.forEach(app => { app.onFocus() })
    })
  }
}

window.addEventListener('load', () => {
  StorageUtil.setKeyPrefix('nesemu:')
  GamepadManager.setUp()

  const root = document.getElementById('nesroot')
  const main = new Main(root)
})
