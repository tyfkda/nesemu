import DomUtil from '../util/dom_util'
import {GamepadManager} from '../util/gamepad_manager'
import {KeyCode} from '../util/key_code'
import {PadKeyHandler} from '../util/pad_key_handler'
import Wnd from './wnd'

const BASE_PRIORITY = 100

function setWindowZIndex(wnd: Wnd, i: number, n: number) {
  wnd.getRootNode().style.zIndex = String(BASE_PRIORITY + (n - 1 - i))
}

export default class WindowManager {
  private windows: Wnd[] = []
  private padKeyHandler = new PadKeyHandler()
  private pressingKeys: {[key: number]: boolean} = {}

  private onKeyDown: (event: Event) => any
  private onKeyUp: (event: Event) => any

  public constructor(private root: HTMLElement) {
    this.onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey) {  // Ctrl+W: Quit
        if (event.keyCode === KeyCode.W) {
          if (this.windows.length > 0)
            this.windows[0].close()
          return
        }
      }

      if (event.ctrlKey || event.altKey || event.metaKey)
        return

      event.preventDefault()
      this.padKeyHandler.onKeyDown(event.keyCode)
      this.pressingKeys[event.keyCode] = true
    }
    this.onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault()
      this.padKeyHandler.onKeyUp(event.keyCode)
      this.pressingKeys[event.keyCode] = false
    }
    this.root.addEventListener('keydown', this.onKeyDown)
    this.root.addEventListener('keyup', this.onKeyUp)

    this.root.focus()
  }

  public getPadStatus(wnd: Wnd, i: number): number {
    if (!wnd.isTop())
      return 0
    return this.padKeyHandler.getStatus(i) | GamepadManager.getState(i)
  }

  public getKeyPressing(wnd: Wnd, keyCode: number): boolean {
    return wnd.isTop() && this.pressingKeys[keyCode]
  }

  public add(wnd: Wnd): void {
    this.windows.unshift(wnd)
    this.root.appendChild(wnd.getRootNode())
    this.updateWindowPriorities()
  }

  public remove(wnd: Wnd): void {
    this.removeWnd(wnd)

    const elem = wnd.getRootNode()
    if (elem != null && elem.parentNode != null)
      elem.parentNode.removeChild(elem)
  }

  public async showSnackbar(message: string, option: any = {}) {
    const wait = option.wait || 3000

    const div = document.createElement('div')
    div.className = 'snackbar-container'
    div.style.zIndex = '10000'
    const box = document.createElement('div')
    box.className = 'snackbar-box'
    div.appendChild(box)
    const text = document.createTextNode(message)
    box.appendChild(text)
    this.root.appendChild(div)

    await DomUtil.timeout(20)  // Dirty hack.
    div.style.top = '8px'
    await DomUtil.timeout(wait)
    div.style.top = '-32px'
    await DomUtil.timeout(500)
    this.root.removeChild(div)
  }

  public moveToTop(wnd: Wnd): void {
    const n = this.windows.length
    if (n > 0 && this.windows[0] === wnd)  // Already on the top
      return

    let prev = wnd
    for (let i = 0; i < n; ++i) {
      const tmp = this.windows[i]
      this.windows[i] = prev
      if (tmp === wnd)
        break
      prev = tmp
    }

    this.updateWindowPriorities()
  }

  public setFullscreen(element: HTMLElement, callback: (isFullscreen: boolean) => void): boolean {
    const kList = [
      { fullscreen: 'requestFullscreen', change: 'fullscreenchange' },
      { fullscreen: 'webkitRequestFullScreen', change: 'webkitfullscreenchange' },
      { fullscreen: 'mozRequestFullScreen', change: 'mozfullscreenchange' },
      { fullscreen: 'msRequestFullscreen', change: 'MSFullscreenChange' },
    ]
    for (let i = 0; i < kList.length; ++i) {
      if (element[kList[i].fullscreen]) {
        element[kList[i].fullscreen]()
        const changeEvent = kList[i].change
        const exitHandler = () => {
          const isFullscreen = !!(document.fullScreen || document.mozFullScreen ||
                                  document.webkitIsFullScreen)
          if (isFullscreen) {
            element.setAttribute('tabindex', '1')
            element.style.cursor = 'none'
            element.addEventListener('keydown', this.onKeyDown)
            element.addEventListener('keyup', this.onKeyUp)
          } else {
            element.removeAttribute('tabindex')
            element.style.cursor = ''
            element.removeEventListener('keydown', this.onKeyDown)
            element.removeEventListener('keyup', this.onKeyUp)
          }

          if (callback)
            callback(isFullscreen)
          if (isFullscreen) {
            element.focus()
          } else {  // End
            document.removeEventListener(changeEvent, exitHandler, false)
            this.root.focus()
          }
        }
        document.addEventListener(changeEvent, exitHandler, false)

        return true
      }
    }
    return false
  }

  private removeWnd(wnd: Wnd): void {
    const index = this.windows.indexOf(wnd)
    if (index < 0)
      return
    this.windows.splice(index, 1)
    this.updateWindowPriorities()
  }

  private updateWindowPriorities(): void {
    const n = this.windows.length
    for (let i = 0; i < n; ++i) {
      let wnd = this.windows[i]
      wnd.setTop(i === 0)
      setWindowZIndex(wnd, i, n)
    }
  }
}
