import WindowManager from './window_manager.ts'

export default class Wnd {
  public static HEADER_HEIGHT = 12

  private root: HTMLElement

  public constructor(windowManager: WindowManager,
                     width: number, height: number, title: string, content: HTMLElement)
  {
    const root = document.createElement('div')
    this.root = root
    root.className = 'wnd'
    root.style.position = 'absolute'
    root.style.width = `${width}px`
    root.style.height = `${height + Wnd.HEADER_HEIGHT}px`

    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar clearfix'
    root.appendChild(titleBar)

    this.addTitleButton(titleBar, 'close', () => {
      windowManager.remove(this)
    })
    this.addTitle(titleBar, title)

    const contentHolder = document.createElement('div')
    contentHolder.className = 'content-holder'
    contentHolder.appendChild(content)
    root.appendChild(contentHolder)
  }

  public setPos(x: number, y: number): void {
    this.root.style.left = `${x}px`
    this.root.style.top = `${y}px`
  }

  public getRootNode(): HTMLElement {
    return this.root
  }

  public update(): void {
  }

  private addTitleButton(element: HTMLElement, className: string, clickCallback: EventListener): HTMLElement {
    const button = document.createElement('div')
    button.className = `${className} btn`
    button.addEventListener('click', clickCallback)
    element.appendChild(button)
    return button
  }

  private addTitle(titleBar: HTMLElement, title: string): HTMLElement {
    const text = document.createElement('div')
    text.className = 'title'
    text.appendChild(document.createTextNode(title))
    titleBar.appendChild(text)
    return text
  }
}
