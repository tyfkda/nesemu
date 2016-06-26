///<reference path="../decl/patch.d.ts" />
///<reference path="../decl/stats.d.ts" />

import {App} from './app/app.ts'
import {GamepadManager, GamepadWnd} from './app/gamepad_manager.ts'
import WindowManager from './wnd/window_manager.ts'
import './nes/polyfill.ts'

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

window.addEventListener('load', () => {
  App.setUp()

  const root = document.getElementById('nesroot')
  const wndMgr = new WindowManager(root)

  // Handle file drop.
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    handleFileDrop(root, (romData, name, x, y) => {
      const option = {
        title: name,
        centerX: x,
        centerY: y,
      }
      const app = App.create(wndMgr, option)
      app.loadRom(romData)
    })
  }

  const gamepadText = document.getElementById('gamepad')
  if (GamepadManager.isSupported()) {
    gamepadText.addEventListener('click', () => {
      const gamepadWnd = new GamepadWnd(wndMgr)
      wndMgr.add(gamepadWnd)
    })
  } else {
    gamepadText.style.display = 'none'
  }
})
