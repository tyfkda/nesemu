import Wnd from './wnd.ts'

export default class WindowManager {
  private windows: Wnd[] = []

  public constructor(private root: HTMLElement) {
  }

  public add(wnd: Wnd) {
    this.windows.push(wnd)
    this.root.appendChild(wnd.getRootNode())
  }

  public update(): void {
    this.windows.forEach(wnd => {
      wnd.update()
    })
  }
}
