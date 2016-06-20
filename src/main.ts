///<reference path="../decl/patch.d.ts" />

import {App} from './app/app.ts'
import {GamepadManager, GamepadWnd} from './app/gamepad_manager.ts'
import WindowManager from './wnd/window_manager.ts'
import './nes/polyfill.ts'

// Request Animation Frame
window.requestAnimationFrame = (function() {
  return (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame || window.msRequestAnimationFrame)
})()

function handleFileDrop(dropZone, onDropped) {
  function onDrop(event) {
    event.stopPropagation()
    event.preventDefault()
    const files = event.dataTransfer.files
    if (files.length > 0) {
      const reader = new FileReader()
      reader.onload = function(e) {
        const binary = new Uint8Array((e.target as any).result)
        onDropped(binary, files[0].name, event)
      }
      reader.readAsArrayBuffer(files[0])
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
    handleFileDrop(root, (romData, name, event) => {
      const option = {
        title: name,
        centerX: event.pageX,
        centerY: event.pageY,
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
