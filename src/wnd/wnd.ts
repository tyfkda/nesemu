export default class Wnd {
  public static HEADER_HEIGHT = 12

  private root: HTMLElement

  public constructor() {
  }

  public setPos(x: number, y: number): void {
    this.root.style.left = `${x}px`
    this.root.style.top = `${y}px`
  }

  public construct(parent: HTMLElement, width: number, height: number, title: string, content: HTMLElement): void {
    const root = document.createElement('div')
    root.className = 'wnd'
    root.style.position = 'absolute'
    root.style.width = `${width}px`
    root.style.height = `${height + Wnd.HEADER_HEIGHT}px`

    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar clearfix'
    root.appendChild(titleBar)

    this.addTitleButton(titleBar, 'close', () => {
      this.onCloseButtonClicked()
    })
    this.addTitle(titleBar, title)

    const contentHolder = document.createElement('div')
    contentHolder.className = 'content-holder'
    contentHolder.appendChild(content)
    root.appendChild(contentHolder)

    this.root = root
    parent.appendChild(this.root)
  }

  private onCloseButtonClicked() {
    this.root.parentNode.removeChild(this.root)
    this.root = null
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
