import Wnd from './wnd.ts'

const BASE_PRIORITY = 100

export default class WindowManager {
  private windows: Wnd[] = []

  public constructor(private root: HTMLElement) {
  }

  public add(wnd: Wnd): void {
    const elem = wnd.getRootNode()
    elem.style.zIndex = String(BASE_PRIORITY + this.windows.length)
    this.windows.unshift(wnd)
    this.root.appendChild(elem)
  }

  public remove(wnd: Wnd): void {
    this.removeWnd(wnd)

    const elem = wnd.getRootNode()
    elem.parentNode.removeChild(elem)
  }

  public moveToTop(wnd: Wnd): void {
    let prev = wnd
    const n = this.windows.length
    for (let i = 0; i < n; ++i) {
      const tmp = this.windows[i]
      this.windows[i] = prev
      prev.getRootNode().style.zIndex = String(BASE_PRIORITY + (n - 1 - i))
      if (tmp === wnd)
        break
      prev = tmp
    }
  }

  public update(): void {
    this.windows.forEach(wnd => {
      wnd.update()
    })
  }

  private removeWnd(wnd: Wnd): void {
    const i = this.windows.indexOf(wnd)
    if (i >= 0)
      this.windows.splice(i, 1)
  }
}
