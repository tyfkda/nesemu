///<reference path="./decl/patch.d.ts" />

import {App} from './app/app'
import DomUtil from './util/dom_util'
import {JsApp} from './app/js_powered_app'
import {GamepadManager, GamepadWnd} from './util/gamepad_manager'
import StorageUtil from './util/storage_util'
import Util from './util/util'
import WindowManager from './wnd/window_manager'
import './nes/polyfill'
import * as JSZip from 'jszip'

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

    DomUtil.handleFileDrop(this.root, (files, x, y) => this.createAppFromFiles(files, x, y))

    const dropDesc = document.getElementById('drop-desc')
    if (dropDesc)
      dropDesc.style.display = ''
  }

  private createAppFromFiles(files: FileList, x: number, y: number): void {
    // Load .js files
    for (let i = 0; i < files.length; ++i) {
      const file = files[i]
      const ext = Util.getExt(file.name).toLowerCase()
      if (ext !== 'js')
        continue
      const jsApp = new JsApp(this.wndMgr, {
        title: file.name,
        centerX: x,
        centerY: y,
        onClosed: (app) => {
          this.removeApp(app)
        },
      })
      jsApp.setFile(file)
      this.apps.push(jsApp)
    }

    const kTargetExts = ['nes']

    // Unzip and flatten.
    const promises = new Array<Promise<any>>()
    for (let i = 0; i < files.length; ++i) {
      const file = files[i]
      let promise: Promise<any>|null = null
      const ext = Util.getExt(file.name).toLowerCase()
      if (ext === 'js') {
        // Skip, because already processed.
      } else if (ext === 'zip') {
        promise = DomUtil.loadFile(file)
          .then(binary => {
            const zip = new JSZip()
            return zip.loadAsync(binary)
          })
          .then((loadedZip: JSZip) => {
            for (let fileName of Object.keys(loadedZip.files)) {
              const ext2 = Util.getExt(fileName).toLowerCase()
              if (kTargetExts.indexOf(ext2) >= 0) {
                return loadedZip.files[fileName].async('uint8array')
                  .then(unzipped => Promise.resolve({type: ext2, binary: unzipped, fileName}))
              }
            }
            return Promise.reject('No .nes file included')
          })
      } else if (kTargetExts.indexOf(ext) >= 0) {
        promise = DomUtil.loadFile(file)
          .then(binary => Promise.resolve({type: ext, binary, fileName: file.name}))
      } else {
        promise = Promise.reject(`Unsupported ext: ${file.name}`)
      }
      if (promise)
        promises.push(promise)
    }
    Promise.all(promises)
      .then(results => {
        const typeMap: {[key: string]: Array<any>} = {}
        results.forEach(result => {
          if (!typeMap[result.type])
            typeMap[result.type] = []
          typeMap[result.type].push(result)
        })
        // Load .nes files.
        if (typeMap.nes) {
          typeMap.nes.forEach(file => {
            this.createAppFromRom(file.binary, file.fileName, x, y)
            x += 16
            y += 16
          })
        }
      })
  }

  private createAppFromRom(romData: Uint8Array, name: string, x: number, y: number): void {
    const m = name.match(/^(.*?)\s*\(.*\)\.\w*$/)
    const title = m ? m[1] : name
    const option = {
      title,
      centerX: x,
      centerY: y,
      onClosed: (_app) => {
        this.removeApp(_app)
      },
    }
    const app = App.create(this.wndMgr, option)
    const result = app.loadRom(romData)
    if (result !== true) {
      this.wndMgr.showSnackbar(`${name}: ${result}`)
      app.close()
      return
    }
    this.apps.push(app)
  }

  private removeApp(app): void {
    const index = this.apps.indexOf(app)
    if (index >= 0)
      this.apps.splice(index, 1)
  }

  private setUpGamePadLink(): void {
    const gamepadText = document.getElementById('gamepad')
    if (gamepadText == null)
      return

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
      this.createAppFromFiles(fileList, 0, 0)

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
  if (root != null)
    new Main(root)
})
