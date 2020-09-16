import App, {Option} from './app/app'
import {AboutWnd, EqualizerWnd, GlobalPaletWnd, VolumeWnd} from './app/other_wnd'
import DomUtil from './util/dom_util'
import JsApp from './app/js_powered_app'
import GamepadManager from './util/gamepad_manager'
import {KeyConfigWnd, GamepadWnd} from './app/key_config_wnd'
import StorageUtil from './util/storage_util'
import Util from './util/util'
import WindowManager from './wnd/window_manager'
import WndUtil from './wnd/wnd_util'
import {MenuItemInfo} from './wnd/types'
import './util/polyfill'
import * as JSZip from 'jszip'

// Request Animation Frame
window.requestAnimationFrame = (function() {
  return (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame || window.msRequestAnimationFrame)
})()

class Main {
  private wndMgr: WindowManager
  private menuItems: Array<MenuItemInfo>
  private apps: App[] = []
  private diskBios: Uint8Array|null = null
  private uninsertedApp: App|null = null
  private keyConfigWnd: KeyConfigWnd|null = null
  private gamepadWnd: GamepadWnd|null = null
  private globalPaletWnd: GlobalPaletWnd|null = null
  private equalizerWnd: EqualizerWnd|null = null
  private volumeWnd: VolumeWnd|null = null
  private aboutWnd: AboutWnd|null = null

  constructor(private root: HTMLElement) {
    this.wndMgr = new WindowManager(root)

    VolumeWnd.setUp()

    this.setUpSysmenu()
    this.setUpFileDrop()
    this.setUpBlur()
  }

  private setUpSysmenu(): void {
    this.menuItems = [
      {
        label: '👾',
        submenu: [
          {
            label: 'Open',
            click: () => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.nes,.zip, application/zip'
              input.onchange = (_event) => {
                if (!input.value)
                  return
                const fileList = input.files
                if (fileList)
                  this.createAppFromFiles(fileList, 0, 0)

                // Clear.
                input.value = ''
              }
              input.click()
            },
          },
          {
            label: 'Global palet',
            click: () => this.openGlobalPaletWnd(),
          },
          {
            label: 'Key config',
            click: () => this.openKeyConfigWnd(),
          },
          {
            label: 'Gamepad',
            click: () => this.openGamepadWnd(),
            disabled: !GamepadManager.isSupported(),
          },
          {
            label: 'Volume',
            click: () => this.openVolumeWnd(),
          },
          {
            label: 'Equalizer',
            click: () => this.openEqualizerWnd(),
          },
          {
            label: 'About',
            click: () => this.openAboutWnd(),
          },
        ],
      },
    ]

    const bar = document.getElementById('sysmenu-bar')
    if (bar == null)
      return

    const itemElems: HTMLElement[] = []
    let activeSubmenuIndex = -1
    let closeSubmenu: (() => void) | null

    const onClose = () => {
      if (activeSubmenuIndex >= 0) {
        const prev = itemElems[activeSubmenuIndex]
        prev.classList.remove('opened')
        activeSubmenuIndex = -1
      }
      closeSubmenu = null
      bar.classList.remove('selected')
    }

    const showSubmenu = (index: number) => {
      const menuItem = this.menuItems[index]
      if (!('submenu' in menuItem) || activeSubmenuIndex === index)
        return

      if (closeSubmenu != null)
        closeSubmenu()

      if (activeSubmenuIndex >= 0) {
        const prev = itemElems[activeSubmenuIndex]
        prev.classList.remove('opened')
      }
      const itemElem = itemElems[index]
      activeSubmenuIndex = index
      closeSubmenu = this.openSubmenu(menuItem, itemElem, onClose)
      itemElem.classList.add('opened')
      bar.classList.add('selected')
    }

    this.menuItems.forEach((menuItem: MenuItemInfo, index: number) => {
      const itemElem = document.createElement('div')
      itemElem.className = 'sysmenu-item pull-left'
      itemElem.innerText = menuItem.label
      itemElem.addEventListener('click', event => {
        event.stopPropagation()
        if ('submenu' in menuItem) {
          if (activeSubmenuIndex < 0) {
            showSubmenu(index)
          } else {
            if (closeSubmenu)
              closeSubmenu()
            onClose()
          }
        }
      })
      bar.appendChild(itemElem)
      itemElems.push(itemElem)

      itemElem.addEventListener('mouseenter', _event => {
        if (activeSubmenuIndex >= 0 && activeSubmenuIndex !== index && 'submenu' in menuItem) {
          showSubmenu(index)
        }
      })
    })
  }

  private openSubmenu(menuItem: MenuItemInfo, itemElem: HTMLElement,
                      onClose?: () => void): () => void
  {
    const rect = WndUtil.getOffsetRect(this.root, itemElem)
    const pos = {
      left: `${rect.left}px`,
      bottom: '0',
    }
    const option = {
      className: 'sysmenu menu-subitem-holder bottom',
      onClose,
    }
    return WndUtil.openSubmenu(menuItem, pos, this.root, option)
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
            for (const fileName of Object.keys(loadedZip.files)) {
              const ext2 = Util.getExt(fileName).toLowerCase()
              if (kTargetExts.indexOf(ext2) >= 0) {
                return loadedZip.files[fileName]
                  .async('uint8array')
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
      .catch((e: Error) => {
        this.wndMgr.showSnackbar(e.toString())
      })
  }

  private createAppFromRom(romData: Uint8Array, name: string, x: number, y: number): void {
    const m = name.match(/^(.*?)(\s*\(.*\))?\.\w+$/)
    const title = m ? m[1] : name
    const option: Option = {
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
    this.apps.push(app)
  }

  private bootDiskImage(biosData: Uint8Array, diskImage: Uint8Array|null, name: string,
                        x: number, y: number): App
  {
    const m = name.match(/^(.*?)\s*\(.*\)\.\w*$/)
    const title = m ? m[1] : name
    const option: Option = {
      title,
      centerX: x,
      centerY: y,
      onClosed: (_app) => {
        this.removeApp(_app)
      },
    }

    const app = App.create(this.wndMgr, option)
    app.bootDiskBios(biosData)
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

  private openGlobalPaletWnd(): void {
    if (this.globalPaletWnd == null) {
      this.globalPaletWnd = new GlobalPaletWnd(this.wndMgr, () => {
        this.globalPaletWnd = null
      })
    } else {
      this.wndMgr.moveToTop(this.globalPaletWnd)
    }
  }

  private openKeyConfigWnd(): void {
    if (this.keyConfigWnd == null) {
      this.keyConfigWnd = new KeyConfigWnd(this.wndMgr, () => {
        this.keyConfigWnd = null
      })
    } else {
      this.wndMgr.moveToTop(this.keyConfigWnd)
    }
  }

  private openGamepadWnd(): void {
    if (!GamepadManager.isSupported()) {
      return
    }

    if (this.gamepadWnd == null) {
      this.gamepadWnd = new GamepadWnd(this.wndMgr, () => {
        this.gamepadWnd = null
      })
    } else {
      this.wndMgr.moveToTop(this.gamepadWnd)
    }
  }

  private openEqualizerWnd(): void {
    if (this.equalizerWnd == null) {
      this.equalizerWnd = new EqualizerWnd(this.wndMgr, () => {
        this.equalizerWnd = null
      })
    } else {
      this.wndMgr.moveToTop(this.equalizerWnd)
    }
  }

  private openVolumeWnd(): void {
    if (this.volumeWnd == null) {
      this.volumeWnd = new VolumeWnd(this.wndMgr, () => {
        this.volumeWnd = null
      })
      this.wndMgr.add(this.volumeWnd)
    } else {
      this.wndMgr.moveToTop(this.volumeWnd)
    }
  }

  private openAboutWnd(): void {
    if (this.aboutWnd == null) {
      this.aboutWnd = new AboutWnd(this.wndMgr, () => {
        this.aboutWnd = null
      })
    } else {
      this.wndMgr.moveToTop(this.aboutWnd)
    }
  }

  private setUpBlur(): void {
    window.addEventListener('blur', () => {
      VolumeWnd.onFocusChanged(false)
    })
    window.addEventListener('focus', () => {
      VolumeWnd.onFocusChanged(true)
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
