///<reference path="./decl/patch.d.ts" />

import {App} from './app/app'
import {GamepadManager, GamepadWnd} from './util/gamepad_manager'
import StorageUtil from './util/storage_util'
import WindowManager from './wnd/window_manager'
import './nes/polyfill'

import * as JSZip from 'jszip'

// Request Animation Frame
window.requestAnimationFrame = (function() {
  return (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame || window.msRequestAnimationFrame)
})()

function getExt(fileName) {
  const index = fileName.lastIndexOf('.')
  if (index >= 0)
    return fileName.slice(index + 1)
  return ''
}

function loadNes(file, onNesFileLoaded) {
  const reader = new FileReader()
  reader.onload = function(e) {
    const binary = new Uint8Array((e.target as any).result)
    onNesFileLoaded(binary, file.name)
  }
  reader.readAsArrayBuffer(file)
}

function loadZip(file, onNesFileLoaded) {
  const reader = new FileReader()
  reader.onload = function(e) {
    const zipBinary = new Uint8Array((e.target as any).result)
    const zip = new JSZip()
    zip.loadAsync(zipBinary)
      .then((loadedZip: JSZip) => {
        Object.keys(loadedZip.files).forEach(fileName => {
          if (getExt(fileName).toLowerCase() === 'nes') {
            loadedZip.files[fileName].async('uint8array')
              .then((rom) => { onNesFileLoaded(rom, fileName) })
              .catch(error => { console.error(error) })
          }
        })
      })
    .catch(error => {
      console.error(error)
    })
  }
  reader.readAsArrayBuffer(file)
}

function handleFile(file, callback) {
  switch (getExt(file.name).toLowerCase()) {
  case 'nes':
    loadNes(file, callback)
    break
  case 'zip':
    loadZip(file, callback)
    break
  default:
    // TODO: Show error message.
    break
  }
}

function handleFileDrop(dropZone, onDropped) {
  function onDrop(event) {
    event.stopPropagation()
    event.preventDefault()
    const files = event.dataTransfer.files
    if (files.length > 0) {
      for (let i = 0; i < files.length; ++i) {
        const file = files[i]
        handleFile(file, (rom, fn) => { onDropped(rom, fn, event.pageX, event.pageY) })
      }
    }
    return false
  }

  function onDragOver(event) {
    event.stopPropagation()
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    return false
  }

  dropZone.addEventListener('dragover', onDragOver, false)
  dropZone.addEventListener('drop', onDrop, false)
}

class Main {
  private wndMgr: WindowManager
  private apps: App[]

  constructor(private root: HTMLElement) {
    this.wndMgr = new WindowManager(root)
    this.apps = []
  }

  public setUp() {
    App.setUp()
    this.setUpFileDrop()
    this.setUpGamePadLink()
    this.setUpOpenRomLink()
    this.setUpBlur()
  }

  private setUpFileDrop() {
    // Handle file drop.
    if (!(window.File && window.FileReader && window.FileList && window.Blob))
      return

    handleFileDrop(this.root, (romData, name, x, y) => {
      this.createApp(romData, name, x, y)
    })
  }

  private createApp(romData, name, x, y) {
    const option = {
      title: name,
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

  private removeApp(app) {
    const index = this.apps.indexOf(app)
    if (index >= 0)
      this.apps.splice(index, 1)
  }

  private setUpGamePadLink() {
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

  private setUpOpenRomLink() {
    const romFile = document.getElementById('rom-file') as HTMLInputElement
    romFile.addEventListener('change', () => {
      if (!romFile.value)
        return
      const fileList = romFile.files
      if (!fileList)
        return
      for (let i = 0; i < fileList.length; ++i) {
        console.log(fileList[i])

        handleFile(fileList[i], (romData, name) => {
          this.createApp(romData, name, 0, 0)
        })
      }

      // Clear.
      romFile.value = ''
    })
  }

  private setUpBlur() {
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
  const root = document.getElementById('nesroot')
  const main = new Main(root)
  main.setUp()
})
