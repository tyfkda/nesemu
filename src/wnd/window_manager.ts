import Wnd from './wnd.ts'

export default class WindowManager {
  private windows: Wnd[] = []

  public create(width: number, height: number, title: string, content: HTMLElement, parent: HTMLElement): Wnd {
    const wnd = new Wnd()
    wnd.construct(parent, width, height, title, content)
    this.windows.push(wnd)
    return wnd
  }
}
