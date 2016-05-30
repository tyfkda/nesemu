import Wnd from './wnd.ts'

export default class WindowManager {
  private windows: Wnd[] = []

  public constructor(private root: HTMLElement) {
  }

  public add(wnd: Wnd) {
    this.windows.push(wnd)
    this.root.appendChild(wnd.getRootNode())
  }

  public remove(wnd: Wnd) {
    const i = this.windows.indexOf(wnd)
    if (i >= 0)
      this.windows.splice(i, 1)

    const elem = wnd.getRootNode()
    elem.parentNode.removeChild(elem)
  }

  public update(): void {
    this.windows.forEach(wnd => {
      wnd.update()
    })
  }
}
