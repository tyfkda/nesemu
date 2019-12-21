import {App} from './app/app'
import {GlobalPaletWnd} from './app/other_wnd'
import DomUtil from './util/dom_util'
import {JsApp} from './app/js_powered_app'
import {GamepadManager, GamepadWnd} from './util/gamepad_manager'
import StorageUtil from './util/storage_util'
import Util from './util/util'
import WindowManager from './wnd/window_manager'
import './util/polyfill'
import * as JSZip from 'jszip'

// Request Animation Frame
window.requestAnimationFrame = (function() {
  return (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame || window.msRequestAnimationFrame)
})()

const KEY_VOLUME = 'volume'

class Main {
  private wndMgr: WindowManager
  private apps: App[] = []
  private diskBios: Uint8Array|null = null
  private uninsertedApp: App|null = null
  private volume = 1
  private gamepadWnd: GamepadWnd|null = null
  private globalPaletWnd: GlobalPaletWnd|null = null

  constructor(private root: HTMLElement) {
    this.wndMgr = new WindowManager(root)

    this.volume = Util.clamp(StorageUtil.getFloat(KEY_VOLUME, 1), 0, 1)

    this.setUpFileDrop()
    this.setUpPaletLink()
    this.setUpGamePadLink()
    this.setUpVolumeLink()
    this.setUpOpenRomLink()
    this.setUpBlur()
  }

  private setUpFileDrop(): void {
    const dropDesc = document.getElementById('drop-desc')
    if (!dropDesc)
      return

    // Handle file drop.
    if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
      dropDesc.style.display = 'none'
      return
    }
    dropDesc.style.opacity = '0'

    DomUtil.handleFileDrop(this.root, (files, x, y) => {
      this.createAppFromFiles(files, x, y)
      dropDesc.style.display = 'none'
    })
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

    const kTargetExts = ['nes', 'bin', 'fds']

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
            return Promise.reject(`No .nes file included: ${file.name}`)
          })
      } else if (kTargetExts.indexOf(ext) >= 0) {
        promise = DomUtil.loadFile(file)
          .then(binary => Promise.resolve({type: ext, binary, fileName: file.name}))
      } else {
        promise = Promise.reject(`Unsupported file: ${file.name}`)
      }
      if (promise)
        promises.push(promise)
    }
    Promise.all(promises)
      .catch((e: Error) => {
        this.wndMgr.showSnackbar(e.toString())
      })
      .then(results => {
        const typeMap: {[key: string]: Array<any>} = {}
        ; (results as {type: string, binary: Uint8Array, fileName: string}[]).forEach(result => {
          if (!typeMap[result.type])
            typeMap[result.type] = []
          typeMap[result.type].push(result)
        })
        // .bin: Disk BIOS
        if (typeMap.bin) {
          this.diskBios = typeMap.bin[0].binary as Uint8Array
          if (!typeMap.fds) {  // Boot disk system without inserting disk.
            this.uninsertedApp = this.bootDiskImage(this.diskBios, null, 'DISK System', x, y)
          }
        }
        // Load .nes files.
        if (typeMap.nes) {
          typeMap.nes.forEach(file => {
            this.createAppFromRom(file.binary, file.fileName, x, y)
            x += 16
            y += 16
          })
        }
        // Load .fds
        if (typeMap.fds) {
          const diskBios = this.diskBios
          if (diskBios == null) {
            this.wndMgr.showSnackbar('.fds needs BIOS file (.bin) for Disk System')
            return
          }

          typeMap.fds.forEach(file => {
            if (this.uninsertedApp != null) {
              this.uninsertedApp.setDiskImage(file.binary)
              this.uninsertedApp = null
            } else {
              this.bootDiskImage(diskBios, file.binary, file.fileName, x, y)
            }
            x += 16
            y += 16
          })
        }
      })
  }

  private createAppFromRom(romData: Uint8Array, name: string, x: number, y: number): void {
    const m = name.match(/^(.*?)(\s*\(.*\))?\.\w+$/)
    const title = m ? m[1] : name
    const option = {
      title,
      centerX: x,
      centerY: y,
      onClosed: (app2) => {
        this.removeApp(app2)
      },
    }
    const app = new App(this.wndMgr, option)
    const result = app.loadRom(romData)
    if (result !== true) {
      this.wndMgr.showSnackbar(`${name}: ${result}`)
      app.close()
      return
    }
    app.setVolume(this.volume)
    this.apps.push(app)
  }

  private bootDiskImage(biosData: Uint8Array, diskImage: Uint8Array|null, name: string,
                        x: number, y: number): App
  {
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
    app.bootDiskBios(biosData)
    app.setVolume(this.volume)
    if (diskImage != null)
      app.setDiskImage(diskImage)
    this.apps.push(app)
    return app
  }

  private removeApp(app: App): void {
    const index = this.apps.indexOf(app)
    if (index >= 0)
      this.apps.splice(index, 1)
  }

  private setUpPaletLink(): void {
    const text = document.getElementById('palet')
    if (text == null)
      return

    text.addEventListener('click', () => {
      if (this.globalPaletWnd == null) {
        this.globalPaletWnd = new GlobalPaletWnd(this.wndMgr, () => {
          this.globalPaletWnd = null
        })
        this.wndMgr.add(this.globalPaletWnd)
      } else {
        this.wndMgr.moveToTop(this.globalPaletWnd)
      }
    })
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
      if (this.gamepadWnd == null) {
        this.gamepadWnd = new GamepadWnd(this.wndMgr, () => {
          this.gamepadWnd = null
        })
        this.wndMgr.add(this.gamepadWnd)
      } else {
        this.wndMgr.moveToTop(this.gamepadWnd)
      }
    })
  }

  private setUpVolumeLink(): void {
    const volumeText = document.getElementById('volume')
    const sliderContainer = document.getElementById('volume-slider-container')
    const slider = document.getElementById('volume-slider')
    if (volumeText == null || sliderContainer == null || slider == null)
      return

    let dragging = false
    let leave = false
    let leaveTimeout: number = -1
    sliderContainer.addEventListener('mousedown', (event) => {
      if (event.button !== 0)
        return
      dragging = true
      const sliderHeight = (slider.parentNode as HTMLElement).getBoundingClientRect().height
      const updateSlider = (event2) => {
        const [, y] = DomUtil.getMousePosIn(event2, slider.parentNode as HTMLElement)
        const height = Util.clamp(sliderHeight - y, 0, sliderHeight)
        slider.style.height = `${height}px`
        this.volume = height / sliderHeight
        this.apps.forEach(app => {
          app.setVolume(this.volume)
        })
      }
      DomUtil.setMouseDragListener({
        move: updateSlider,
        up: (_event2) => {
          dragging = false
          if (leave)
            hideSlider()
          this.volume = Math.round(this.volume * 100) / 100
          StorageUtil.put(KEY_VOLUME, this.volume)
        },
      })
      updateSlider(event)
    })

    const showSlider = () => {
      const prect = volumeText.getBoundingClientRect() as DOMRect
      const w = parseInt(sliderContainer.style.width || '0', 10)
      const h = parseInt(sliderContainer.style.height || '0', 10)
      DomUtil.setStyles(sliderContainer, {
        display: 'inherit',
        top: `${Math.round(prect.y - h)}px`,
        left: `${Math.round(prect.x + (prect.width - w) / 2)}px`,
      })
      const sliderHeight = (slider.parentNode as HTMLElement).getBoundingClientRect().height
      slider.style.height = `${this.volume * sliderHeight}px`

      volumeText.classList.add('active')
    }
    const hideSlider = () => {
      DomUtil.setStyles(sliderContainer, {
        display: 'none',
      })

      volumeText.classList.remove('active')
    }

    volumeText.addEventListener('mouseenter', () => {
      showSlider()
    })
    volumeText.addEventListener('mouseleave', () => {
      leaveTimeout = window.setTimeout(() => {
        hideSlider()
      }, 10)
    })

    sliderContainer.addEventListener('mouseenter', (_event) => {
      leave = false
      if (leaveTimeout !== -1) {
        clearTimeout(leaveTimeout)
        leaveTimeout = -1
      }
    })
    sliderContainer.addEventListener('mouseleave', (_event) => {
      leave = true
      if (!dragging)
        hideSlider()
    })
  }

  private setUpOpenRomLink(): void {
    const input = document.getElementById('rom-file') as HTMLInputElement
    input.addEventListener('change', () => {
      if (!input.value)
        return
      const fileList = input.files
      if (fileList)
        this.createAppFromFiles(fileList, 0, 0)

      // Clear.
      input.value = ''
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
