import Wnd from './wnd'
import Util from '../util/util'

const BASE_PRIORITY = 100

function setWindowZIndex(wnd: Wnd, i: number, n: number) {
  wnd.getRootNode().style.zIndex = String(BASE_PRIORITY + (n - 1 - i))
}

export default class WindowManager {
  private windows: Wnd[] = []

  public constructor(private root: HTMLElement) {
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

    await Util.timeout(20)  // Dirty hack.
    div.style.top = '8px'
    await Util.timeout(wait)
    div.style.top = '-32px'
    await Util.timeout(500)
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
