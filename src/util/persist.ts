import {App, Option} from '../app/app'
import {Nes} from '../nes/nes'
import {StorageUtil as SU} from './storage_util'
import {WindowManager} from '../wnd/window_manager'

const KEY_PERSIST_ROMS = 'persist-roms'
const KEY_PERSIST_COORDS = 'persist-coords'

export type PersistToken = string;

type RomsP = Record<string, {title: string, rom: string}>
type CoordsP = Record<string, {x: number, y: number}>

export class Persistor {
  private static isLocked: boolean = false

  public static clearAllPersists(): void {
    SU.putObject(KEY_PERSIST_ROMS, {})
    SU.putObject(KEY_PERSIST_COORDS, {})
  }

  public static addPersist(title: string, romData: Uint8Array, x: number, y: number): PersistToken {
    const romsP: RomsP = SU.getObject(KEY_PERSIST_ROMS, {})
    const coordsP: CoordsP = SU.getObject(KEY_PERSIST_COORDS, {})

    let newTok: PersistToken = String(Math.random())

    while (newTok in romsP || newTok in coordsP) {
      newTok += String(Math.random())
    }

    const romRec = {
      title: title,
      rom: (romData as any).toBase64(),
    }
    romsP[newTok] = romRec
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

    if (this.isLocked) return

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
        x: x,
        y: y,
        onClosed: onClosed,
        persistTok: tok,
      }
      // Fallback, won't be used:

      const nes = new Nes()
      const app = new App(wndMgr, opt, nes)
      const romData = (Uint8Array as any).fromBase64(romsP[tok].rom)
      const result = app.loadRom(romData)
      if (result != null) {
        wndMgr.showSnackbar(`${name}: ${result}`)
        app.close()
      }

      apps.push(app)
      x += 16
      y += 16
    }

    return apps
  }

  public static lock(): void {
    // Permanently prevents destruction of persisted ROMS by apps.
    // Should only ever be called during shutdown/page unload.
    this.isLocked = true
  }
}
