import {App, Option} from './app/app'
import {AboutWnd, GlobalPaletWnd, SettingWnd} from './app/other_wnd'
import {SpectrumWnd} from './app/spectrum_wnd'
import {AudioManager} from './util/audio_manager'
import {DomUtil} from './util/dom_util'
import {JsApp, JsNes} from './app/js_powered_app'
import {PadKeyHandler} from './util/pad_key_handler'
import {GamepadManager} from './util/gamepad_manager'
import {GlobalSetting} from './app/global_setting'
import {KeyConfigWnd, GamepadWnd} from './app/key_config_wnd'
import {StorageUtil} from './util/storage_util'
import {Util} from './util/util'
import {WindowManager} from './wnd/window_manager'
import {Nes} from './nes/nes'
import './util/polyfill'
import {AsyncTerminable, unzip, Unzipped} from 'fflate'
import {Persistor} from './util/persist'

import audioOnImg from './res/audio_on.png'
import audioOffImg from './res/audio_off.png'

// Request Animation Frame
window.requestAnimationFrame =
  (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
   /*window.webkitRequestAnimationFrame ||*/ window.msRequestAnimationFrame)

class Main {
  private wndMgr: WindowManager
  private apps: App[] = []
  private diskBios: Uint8Array | null = null
  private uninsertedApp: App | null = null
  private keyConfigWnd: KeyConfigWnd | null = null
  private gamepadWnd: GamepadWnd | null = null
  private globalPaletWnd: GlobalPaletWnd | null = null
  private spectrumWnd: SpectrumWnd | null = null
  private settingWnd: SettingWnd | null = null
  private aboutWnd: AboutWnd | null = null

  private muted = false
  private focused = true
  private audioEnabled = false

  constructor(private root: HTMLElement) {
    this.wndMgr = new WindowManager(root)

    GlobalSetting.setUp()
    this.setUpAudio()
    this.setUpStartMenu()
    this.setUpFileDrop()
    this.setUpBlur()

    window.addEventListener('resize', (_: any) => this.wndMgr.onResizeWindow())

    if (GlobalSetting.persistCarts) {
      const apps = Persistor.launchPersists(this.wndMgr, (app: App) => this.removeApp(app))
      this.apps = this.apps.concat(apps)
      if (this.apps.length != 0) {
        const element = document.getElementById('drop-desc')
        if (element)
          element.style.display = 'none'
      }
    }

    const bios = StorageUtil.get('fds-bios', '')
    if (bios)
      this.diskBios = Util.convertBase64StringToUint8Array(bios)
  }

  public shutDown(): void {
    Persistor.lock()
    for (const app of this.apps)
      app.destroy()
    GlobalSetting.destroy()
  }

  private setUpStartMenu(): void {
    const submenuItems = [
      {
        label: 'Open',
        click: () => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.nes,.sav,.zip, application/zip'
          input.onchange = _event => {
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
        label: 'Spectrum Analyzer',
        click: () => this.openSpectrumWnd(),
      },
      {
        label: 'Setting',
        click: () => this.openSettingWnd(),
      },
      {
        label: 'About',
        click: () => this.openAboutWnd(),
      },
    ]

    this.wndMgr.setUpStartMenu('👾', submenuItems)
  }

  private setUpFileDrop(): void {
    const dropDesc = document.getElementById('drop-desc')
    if (!dropDesc)
      return

    dropDesc.innerText = 'Drop .nes file here'

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

  private async createAppFromFiles(files: FileList, x: number, y: number): Promise<void> {
    const kTargetExts = new Set(['nes', 'bin', 'fds', 'sav'])

    // Unzip and flatten.
    type Result = {type: string; binary: Uint8Array; fileName: string}
    const promises = Array.from(files)
      .map(file => { return {file, ext: Util.getExt(file.name).toLowerCase()} })
      .filter(({file, ext}) => {
        if (ext !== 'js')
          return true

        // Create .js app
        const jsNes = new JsNes()
        const jsApp = JsApp.create(this.wndMgr, {
          title: file.name,
          centerX: x,
          centerY: y,
          onClosed: app => this.removeApp(app),
        }, jsNes)
        jsApp.setFile(file)
        this.apps.push(jsApp)
        return false
      })
      .map(async ({file, ext}) => {
        function promisify(f: (...args: any[]) => AsyncTerminable) {
          return (...args: any[]) =>  {
            return new Promise<Unzipped>((resolve, reject) => {
              f(...args, (err: any, result: any) => {
                if (err != null)
                  reject(err)
                else
                  resolve(result)
              })
            })
          }
        }

        if (ext === 'zip') {
          const binary = await DomUtil.loadFile(file)
          const options = {
            filter(file: any) {
              const ext2 = Util.getExt(file.name).toLowerCase()
              return kTargetExts.has(ext2)
            },
          }
          const loadedZip = await promisify(unzip)(binary, options)
          for (const fileName2 of Object.keys(loadedZip)) {
            const ext2 = Util.getExt(fileName2).toLowerCase()
            console.assert(kTargetExts.has(ext2))  // Already filtered.
            const unzipped = loadedZip[fileName2]
            return {type: ext2, binary: unzipped, fileName: fileName2}
          }
          return Promise.reject(`No .nes file included: ${file.name}`)
        } else if (kTargetExts.has(ext)) {
          const binary = await DomUtil.loadFile(file)
          return {type: ext, binary, fileName: file.name}
        } else {
          return Promise.reject(`Unsupported file: ${file.name}`)
        }
      })
    try {
      const results = await Promise.all(promises)
      const typeMap: Record<string, Array<Result>> = {}
      results.forEach(result => {
        if (!typeMap[result.type])
          typeMap[result.type] = []
        typeMap[result.type].push(result)
      })
      // .bin: Disk BIOS
      if (typeMap.bin) {
        this.diskBios = typeMap.bin[0].binary
        StorageUtil.put('fds-bios', Util.convertUint8ArrayToBase64String(this.diskBios))
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
      // Load .sav
      if (typeMap.sav) {
        const file = typeMap.sav[0]
        const app = this.findActiveApp()
        if (app == null) {
          throw 'Load save data failed: No active app'
        } else {
          app.loadDataFromBinary(file.binary)
        }
      }
    } catch (e: any) {
      this.wndMgr.showSnackbar(e.toString())
    }
  }

  private findActiveApp(): App|null {
    for (const app of this.apps) {
      if (app.isTop())
        return app
    }
    return null
  }

  private createAppFromRom(romData: Uint8Array, name: string, x: number, y: number): void {
    const m = name.match(/^(.*?)(\s*\(.*\))?\.\w+$/)
    const title = m ? m[1] : name
    const option: Option = {
      title,
      centerX: x,
      centerY: y,
      onClosed: app2 => {
        this.removeApp(app2)
      },
    }
    const nes = new Nes()
    const app = App.create(this.wndMgr, option, nes)
    const result = app.loadRom(romData)
    if (result != null) {
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
      onClosed: app2 => {
        this.removeApp(app2)
      },
    }

    const nes = new Nes()
    const app = App.create(this.wndMgr, option, nes)
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

  private openSpectrumWnd(): void {
    if (this.spectrumWnd == null) {
      this.spectrumWnd = new SpectrumWnd(this.wndMgr, () => {
        this.spectrumWnd = null
      })
    } else {
      this.wndMgr.moveToTop(this.spectrumWnd)
    }
  }

  private openSettingWnd(): void {
    if (this.settingWnd == null) {
      this.settingWnd = new SettingWnd(this.wndMgr, () => {
        this.settingWnd = null
      })
    } else {
      this.wndMgr.moveToTop(this.settingWnd)
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
      if (GlobalSetting.muteOnInactive)
        this.onFocusChanged(false)
    })
    window.addEventListener('focus', () => {
      if (GlobalSetting.muteOnInactive)
        this.onFocusChanged(true)
    })
  }

  private setUpAudio(): void {
    const audioContextClass = window.AudioContext || window.webkitAudioContext
    AudioManager.setUp(audioContextClass)
    AudioManager.setMasterVolume(GlobalSetting.volume)

    const icon = document.getElementById('audio-toggle-icon') as HTMLImageElement
    icon.src = audioOffImg
    DomUtil.setStyles(icon, {visibility: null})

    const button = document.getElementById('audio-toggle')
    button?.addEventListener('click', _event => {
      let muted: boolean
      if (!this.audioEnabled) {
        AudioManager.enableAudio()
        for (const app of this.apps)
          app.setupAudioManager()
        this.audioEnabled = true
        muted = false
      } else {
        muted = !this.muted
        this.setMuted(muted)
      }
      icon.src = muted ? audioOffImg : audioOnImg
      this.wndMgr.setFocus()
    })
  }

  private onFocusChanged(focused: boolean): void {
    this.focused = focused
    this.updateVolume()
  }

  private setMuted(muted: boolean): void {
    this.muted = muted
    this.updateVolume()
  }

  private updateVolume(): void {
    if (this.focused && !this.muted) {
      AudioManager.setMasterVolume(GlobalSetting.volume)
    } else {
      AudioManager.setMasterVolume(0)
    }
  }
}

let main: Main

window.addEventListener('load', () => {
  StorageUtil.setKeyPrefix('nesemu:')
  PadKeyHandler.setUp()
  GamepadManager.setUp()

  const root = document.getElementById('nesroot')
  if (root != null)
    main = new Main(root)
})

window.addEventListener('beforeunload', () => main?.shutDown())
