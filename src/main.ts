///<reference path="../decl/patch.d.ts" />

import {App} from './app/app.ts'

import WindowManager from './wnd/window_manager.ts'

// Request Animation Frame
window.requestAnimationFrame = (function() {
  return (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame || window.msRequestAnimationFrame)
})()

function handleFileDrop(dropZone, onDropped) {
  function onDrop(evt) {
    evt.stopPropagation()
    evt.preventDefault()
    const files = evt.dataTransfer.files
    if (files.length > 0) {
      const reader = new FileReader()
      reader.onload = function(e) {
        const binary = new Uint8Array((e.target as any).result)
        onDropped(binary, files[0].name)
      }
      reader.readAsArrayBuffer(files[0])
    }
    return false
  }

  function onDragOver(evt) {
    evt.stopPropagation()
    evt.preventDefault()
    evt.dataTransfer.dropEffect = 'copy'
    return false
  }

  dropZone.addEventListener('dragover', onDragOver, false)
  dropZone.addEventListener('drop', onDrop, false)
}

window.addEventListener('load', () => {
  const root = document.getElementById('nesroot')
  const wndMgr = new WindowManager(root)

  // Handle file drop.
  if (window.File && window.FileReader && window.FileList && window.Blob) {
    handleFileDrop(root, (romData, name) => {
      const app = App.create(wndMgr, root, name)
      app.loadRom(romData)
    })
  }
})
