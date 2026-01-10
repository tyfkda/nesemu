import {App, Option} from '../app/app'
import {Nes} from '../nes/nes'
import {StorageUtil as SU} from './storage_util'
import {WindowManager} from '../wnd/window_manager'

const KEY_PERSIST_ROMS = 'persist-roms'
const KEY_PERSIST_COORDS = 'persist-coords'

export type PersistToken = string;

type RomsP = Record<string, {title: string, rom: Uint8Array}>
type CoordsP = Record<string, {x: number, y: number}>

export class Persistor {
  public static clearAllPersists(): void {
    SU.putObject(KEY_PERSIST_ROMS, {})
    SU.putObject(KEY_PERSIST_COORDS, {})
  }

  public static addPersist(rom: {title: string, rom: Uint8Array}, x: number, y: number): PersistToken {
    const romsP: RomsP = SU.getObject(KEY_PERSIST_ROMS, {})
    const coordsP: CoordsP = SU.getObject(KEY_PERSIST_COORDS, {})

    let newTok: PersistToken = String(Math.random())

    while (newTok in romsP || newTok in coordsP) {
      newTok += String(Math.random())
    }

    romsP[newTok] = rom
    coordsP[newTok] = {x: x, y: y}

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

    try {
      delete romsP[tok]
      delete coordsP[tok]

      SU.putObject(KEY_PERSIST_ROMS, romsP)
      SU.putObject(KEY_PERSIST_COORDS, coordsP)
    }
    catch (error: any) {
      // Don't want to bother user with a snackbar
      console.log(`Couldn't update persist for ${tok}: ${error}`)
    }
  }

  public static updatePersistCoords(tok: PersistToken, x: number, y: number): void {
    const coordsP: CoordsP = SU.getObject(KEY_PERSIST_COORDS, {})

    coordsP[tok] = {x: x, y: y}

    try {
      SU.putObject(KEY_PERSIST_COORDS, coordsP)
    }
    catch (error: any) {
      // Don't want to bother user with a snackbar
      console.log(`Couldn't update persist coords ${tok}: ${error}`)
    }
  }

  public static launchPersists(wndMgr: WindowManager, onClosed: (app: App) => void): App[] {
    const romsP: RomsP = SU.getObject(KEY_PERSIST_ROMS, {})
    const coordsP: CoordsP = SU.getObject(KEY_PERSIST_COORDS, {})

    // Emergency fallback. Should get overridden by coordsP.
    let x = 50
    let y = 50
    const apps: App[] = []

    for (const tok in romsP) {
      x = coordsP[tok].x || x
      y = coordsP[tok].y || y

      const opt: Option = {
        title: romsP[tok].title,
        centerX: x,
        centerY: y,
        onClosed: onClosed
      }
      // Fallback, won't be used:
      x += 16
      y += 16

      const nes = new Nes()
      const app = new App(wndMgr, opt, nes)
      const result = app.loadRom(romsP[tok].rom)
      if (result != null) {
        wndMgr.showSnackbar(`${name}: ${result}`)
        app.close()
      }
    }

    return apps
  }
}
