import {App, Option, RomType} from '../app/app'
import {Nes} from '../nes/nes'
import {StorageUtil as SU} from './storage_util'
import {Util} from './util'
import {WindowManager} from '../wnd/window_manager'

const KEY_PERSIST_ROMS = 'persist-roms'
const KEY_PERSIST_COORDS = 'persist-coords'

export type PersistToken = string;
export type LaunchResult = {
  apps: App[]
  uninsertedApp?: App
}

type RomsP = Record<string, {title: string, rom: string, type?: string}>
type CoordsP = Record<string, {x: number, y: number, width?: number, height?: number}>

export class Persistor {
  private static isLocked: boolean = false

  public static clearAllPersists(): void {
    SU.putObject(KEY_PERSIST_ROMS, {})
    SU.putObject(KEY_PERSIST_COORDS, {})
  }

  public static addPersist(type: RomType, title: string, romData: Uint8Array, x: number, y: number, width?: number, height?: number): PersistToken {
    const romsP: RomsP = SU.getObject(KEY_PERSIST_ROMS, {})
    const coordsP: CoordsP = SU.getObject(KEY_PERSIST_COORDS, {})

    let newTok: PersistToken = title
    let tokSfx = 0

    while (newTok in romsP || newTok in coordsP) {
      ++tokSfx
      newTok = `${title}_${tokSfx}`
    }

    const romRec = {
      title: title,
      type: type,
      rom: Util.convertUint8ArrayToBase64String(romData),
    }
    romsP[newTok] = romRec
    coordsP[newTok] = {x: x, y: y}
    if (width !== undefined && height !== undefined) {
      coordsP[newTok].width = width
      coordsP[newTok].height = height
    }

    try {
      SU.putObject(KEY_PERSIST_ROMS, romsP)
      SU.putObject(KEY_PERSIST_COORDS, coordsP)
    }
    catch (error: any) {
      // Don't want to bother user with a snackbar
      console.log(`Couldn't add persist: ${error}`)
    }

    return newTok
  }

  public static removePersist(tok: PersistToken): void {
    const romsP: RomsP = SU.getObject(KEY_PERSIST_ROMS, {})
    const coordsP: CoordsP = SU.getObject(KEY_PERSIST_COORDS, {})

    if (this.isLocked) return

    try {
      delete romsP[tok]
      delete coordsP[tok]

      SU.putObject(KEY_PERSIST_ROMS, romsP)
      SU.putObject(KEY_PERSIST_COORDS, coordsP)
    }
    catch (error: any) {
      // Don't want to bother user with a snackbar
      console.log(`Couldn't remove persist for ${tok}: ${error}`)
    }
  }

  public static updatePersistCoords(tok: PersistToken, x: number, y: number, width: number, height: number): void {
    const coordsP: CoordsP = SU.getObject(KEY_PERSIST_COORDS, {})

    coordsP[tok] = {x: x, y: y, width: width, height: height}

    try {
      SU.putObject(KEY_PERSIST_COORDS, coordsP)
    }
    catch (error: any) {
      // Don't want to bother user with a snackbar
      console.log(`Couldn't update persist coords ${tok}: ${error}`)
    }
  }

  public static updatePersistRom(tok: PersistToken, type: RomType, rom: Uint8Array) {
    const romsP: RomsP = SU.getObject(KEY_PERSIST_ROMS, {})

    try {
      romsP[tok].rom = Util.convertUint8ArrayToBase64String(rom)
      romsP[tok].type = type

      SU.putObject(KEY_PERSIST_ROMS, romsP)
    }
    catch (error: any) {
      // Don't want to bother user with a snackbar
      console.log(`Couldn't update persist rom ${tok}: ${error}`)
    }
  }

  public static launchPersists(wndMgr: WindowManager,
                               onClosed: (app: App) => void,
                               biosData: Uint8Array | null): LaunchResult {
    const romsP: RomsP = SU.getObject(KEY_PERSIST_ROMS, {})
    const coordsP: CoordsP = SU.getObject(KEY_PERSIST_COORDS, {})

    // Emergency fallback. Should get overridden by coordsP.
    let x = 50
    let y = 50
    const result : LaunchResult  = { apps: [] }

    for (const tok in romsP) {
      const coords = coordsP[tok]
      x = coords.x || x
      y = coords.y || y

      const opt: Option = {
        title: romsP[tok].title,
        x: x,
        y: y,
        onClosed: onClosed,
        persistTok: tok,
      }

      if (coords.width !== undefined && coords.height !== undefined) {
        opt.width = coords.width
        opt.height = coords.height
      }

      const nes = new Nes()
      const { rom, type, title } = romsP[tok]
      let app: App | null = App.create(wndMgr, opt, nes)

      if (type == RomType.DISK) {
        // Disk ROM
        if (biosData == null) {
          // This should never happen, since this persist data
          // was saved when the bios was present, so that should also
          // have persisted!
          //
          // Silently skip disks launch in the event that the bios
          // isn't available.
          continue
        }
        const romData = rom? Util.convertBase64StringToUint8Array(rom) : null
        app.bootDiskBios(biosData)
        if (romData != null)
          app.setDiskImage(romData)
        else
          result.uninsertedApp = app
      } else {
        // Cartridge ROM
        const romData = Util.convertBase64StringToUint8Array(rom)
        const result = app.loadRom(romData)
        if (result != null) {
          wndMgr.showSnackbar(`${title}: ${result}`)
          app.close()
          app = null
        }
      }

      if (app)
        result.apps.push(app)
      // Fallback, won't be used:
      x += 16
      y += 16
    }

    return result
  }

  public static lock(): void {
    // Permanently prevents destruction of persisted ROMS by apps.
    // Should only ever be called during shutdown/page unload.
    this.isLocked = true
  }
}
