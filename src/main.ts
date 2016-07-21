///<reference path="../decl/patch.d.ts" />

import {App} from './app/app.ts'
import {GamepadManager, GamepadWnd} from './app/gamepad_manager.ts'
import WindowManager from './wnd/window_manager.ts'
import './nes/polyfill.ts'

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

function handleFileDrop(dropZone, onDropped) {
  function onDrop(event) {
    event.stopPropagation()
    event.preventDefault()
    const files = event.dataTransfer.files
    if (files.length > 0) {
      for (let i = 0; i < files.length; ++i) {
        const file = files[i]
        switch (getExt(file.name).toLowerCase()) {
        case 'nes':
          loadNes(file, (rom, fn) => { onDropped(rom, fn, event.pageX, event.pageY) })
          break
        case 'zip':
          loadZip(file, (rom, fn) => { onDropped(rom, fn, event.pageX, event.pageY) })
          break
        default:
          // TODO: Show error message.
          break
        }
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
  constructor(root) {
    this.root = root
    this.wndMgr = new WindowManager(root)
    this.apps = []
  }

  setUp() {
    App.setUp()
    this.setUpFileDrop()
    this.setUpGamePadLink()
  }

  setUpFileDrop() {
    // Handle file drop.
    if (!(window.File && window.FileReader && window.FileList && window.Blob))
      return

    handleFileDrop(this.root, (romData, name, x, y) => {
      this.createApp(romData, name, x, y)
    })
  }

  createApp(romData, name, x, y) {
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

  removeApp(app) {
    const index = this.apps.indexOf(app)
    if (index >= 0)
      this.apps.splice(index, 1)
  }

  setUpGamePadLink() {
    const gamepadText = document.getElementById('gamepad')
    if (!GamepadManager.isSupported()) {
      return gamepadText.style.display = 'none'
    }

    gamepadText.addEventListener('click', () => {
      const gamepadWnd = new GamepadWnd(this.wndMgr)
      this.wndMgr.add(gamepadWnd)
    })
  }
}

window.addEventListener('load', () => {
  const root = document.getElementById('nesroot')
  const main = new Main(root)
  main.setUp()
})
