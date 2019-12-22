import DomUtil from '../util/dom_util'
import {KeyCode} from '../util/key_code'
import {Wnd, WndEvent} from './wnd'

const BASE_PRIORITY = 100

function setWindowZIndex(wnd: Wnd, i: number, n: number) {
  wnd.getRootNode().style.zIndex = String(BASE_PRIORITY + (n - 1 - i))
}

export default class WindowManager {
  private windows: Wnd[] = []

  private onKeyDown: (event: Event) => void
  private onKeyUp: (event: Event) => void
  private isBlur = false

  public constructor(private root: HTMLElement) {
    this.onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey) {  // Ctrl+W: Quit
        if (event.keyCode === KeyCode.W) {
          if (this.windows.length > 0)
            this.windows[0].close()
          return
        }
      }

      event.preventDefault()

      if (this.windows.length > 0) {
        const wnd = this.windows[0]
        wnd.onEvent(WndEvent.KEY_DOWN, event)
      }
    }
    this.onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault()

      if (this.windows.length > 0) {
        const wnd = this.windows[0]
        wnd.onEvent(WndEvent.KEY_UP, event)
      }
    }
    this.root.addEventListener('keydown', this.onKeyDown)
    this.root.addEventListener('keyup', this.onKeyUp)

    this.root.focus()

    this.setUpBlur()
  }

  public IsBlur(): boolean {
    return this.isBlur
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
    const type = option.type || 'danger'

    const div = document.createElement('div')
    div.className = 'snackbar-container'
    div.style.zIndex = '10000'
    const box = document.createElement('div')
    box.className = `snackbar-box ${type}`
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

    this.windows[0].onEvent(WndEvent.BLUR)
    let prev = wnd
    for (let i = 0; i < n; ++i) {
      const tmp = this.windows[i]
      this.windows[i] = prev
      if (tmp === wnd)
        break
      prev = tmp
    }

    this.updateWindowPriorities()
    wnd.onEvent(WndEvent.FOCUS)
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

  private setUpBlur(): void {
    window.addEventListener('focus', () => {
      this.isBlur = false
    })
    window.addEventListener('blur', () => {
      this.isBlur = true
    })
  }
}
