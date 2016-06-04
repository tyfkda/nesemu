import WindowManager from './window_manager.ts'

export default class Wnd {
  public static HEADER_HEIGHT = 12

  private callback: Function
  private root: HTMLElement

  public constructor(private wndMgr: WindowManager,
                     width: number, height: number, title: string, content: HTMLElement)
  {
    this.callback = () => {}
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

  public setCallback(callback: Function): void {
    this.callback = callback
  }

  public getRootNode(): HTMLElement {
    return this.root
  }

  public close(): void {
    if (this.callback('close') === false)
      return  // Cancel close
    this.wndMgr.remove(this)
    this.root = null
  }

  public update(): void {
  }

  public addResizeBox() {
    const W = 8
    const resizeBox = document.createElement('div')
    resizeBox.style.position = 'absolute'
    resizeBox.style.right = resizeBox.style.bottom = '-1px'  // For border width.
    resizeBox.style.width = resizeBox.style.height = `${W}px`
    resizeBox.style.backgroundColor = 'rgba(255, 255, 255, 0.5)'
    resizeBox.style.zIndex = '100'
    resizeBox.style.cursor = 'nwse-resize'

    let dragOfsX, dragOfsY
    const dragMove = (event) => {
      const [x, y] = this.getMousePosIn(event, this.root.parentNode)
      const rect = this.root.getBoundingClientRect()
      const prect = (this.root.parentNode as HTMLElement).getBoundingClientRect()
      let width = x + dragOfsX - (rect.left - prect.left) - 2  // For border size.
      let height = y + dragOfsY - (rect.top - prect.top) - 2
      if (width < 64)
        width = 64
      if (height < 24 + Wnd.HEADER_HEIGHT)
        height = 24 + Wnd.HEADER_HEIGHT
      this.root.style.width = `${width}px`
      this.root.style.height = `${height}px`
      this.callback('resize', width, height - Wnd.HEADER_HEIGHT)
    }
    const dragFinish = (event) => {
      this.root.parentNode.removeEventListener('mousemove', dragMove)
      this.root.parentNode.removeEventListener('mouseup', dragFinish)
    }
    resizeBox.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const [x, y] = this.getMousePosIn(event, resizeBox)
      dragOfsX = W - x
      dragOfsY = W - y
      this.root.parentNode.addEventListener('mousemove', dragMove)
      this.root.parentNode.addEventListener('mouseup', dragFinish)
    })
    this.root.appendChild(resizeBox)
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
      this.close()
    })
    this.addTitle(titleBar, title)

    // Move window position with dragging.
    let dragOfsX, dragOfsY
    const dragMove = (event) => {
      const [x, y] = this.getMousePosIn(event, this.root.parentNode)
      this.root.style.left = `${x + dragOfsX}px`
      this.root.style.top = `${y + dragOfsY}px`
    }
    const dragFinish = (event) => {
      this.root.parentNode.removeEventListener('mousemove', dragMove)
      this.root.parentNode.removeEventListener('mouseup', dragFinish)
    }
    titleBar.addEventListener('mousedown', (event) => {
      dragOfsX = dragOfsY = null
      if (event.button !== 0)
        return
      event.preventDefault()
      const [x, y] = this.getMousePosIn(event, this.root)
      dragOfsX = -x
      dragOfsY = -y
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

  private getMousePosIn(event: MouseEvent, elem: HTMLElement) {
    const rect = elem.getBoundingClientRect()
    const scrollLeft = document.body.scrollLeft
    const scrollTop = document.body.scrollTop
    return [event.pageX - rect.left - scrollLeft,
            event.pageY - rect.top - scrollTop]
  }
}
