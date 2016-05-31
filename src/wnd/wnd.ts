import WindowManager from './window_manager.ts'

export default class Wnd {
  public static HEADER_HEIGHT = 12

  private root: HTMLElement

  public constructor(private wndMgr: WindowManager,
                     width: number, height: number, title: string, content: HTMLElement)
  {
    const root = this.createRoot()
    this.root = root
    root.className = 'wnd'
    root.style.position = 'absolute'
    root.style.width = `${width}px`
    root.style.height = `${height + Wnd.HEADER_HEIGHT}px`

    const titleBar = this.createTitleBar(title)
    root.appendChild(titleBar)

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

  private createRoot(): HTMLElement {
    const root = document.createElement('div')
    root.addEventListener('mousedown', (event) => {
      event.stopPropagation()
      this.wndMgr.moveToTop(this)
      return false
    })
    return root
  }

  private createTitleBar(title: string): HTMLElement {
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar clearfix'

    this.addTitleButton(titleBar, 'close', () => {
      this.wndMgr.remove(this)
    })
    this.addTitle(titleBar, title)

    // Move window position with dragging.
    let dragOfsX, dragOfsY
    const dragMove = (event) => {
      const [x, y] = this.getMousePos(event)
      this.root.style.left = `${x + dragOfsX}px`
      this.root.style.top = `${y + dragOfsY}px`
    }
    const dragFinish = (event) => {
      this.root.parentNode.removeEventListener('mousemove', dragMove)
    }
    titleBar.addEventListener('mousedown', (event) => {
      dragOfsX = dragOfsY = null
      if (event.button !== 0)
        return
      event.preventDefault()
      const [x, y] = this.getMousePos(event)
      const rect = this.root.getBoundingClientRect()
      const scrollLeft = document.body.scrollLeft
      const scrollTop = document.body.scrollTop
      dragOfsX = rect.left - x - scrollLeft
      dragOfsY = rect.top - y - scrollTop
      this.root.parentNode.addEventListener('mousemove', dragMove)
      this.root.parentNode.addEventListener('mouseup', dragFinish)
      return true
    })

    return titleBar
  }

  private addTitleButton(element: HTMLElement, className: string,
                         clickCallback: EventListener): HTMLElement
  {
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

  private getMousePos(event) {
    const rect = (this.root.parentNode as HTMLElement).getBoundingClientRect()
    const scrollLeft = document.body.scrollLeft
    const scrollTop = document.body.scrollTop
    return [event.pageX - rect.left - scrollLeft,
            event.pageY - rect.top - scrollTop]
  }
}
