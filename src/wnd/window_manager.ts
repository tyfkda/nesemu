import Wnd from './wnd'

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
    if (elem != null)
      elem.parentNode.removeChild(elem)
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
