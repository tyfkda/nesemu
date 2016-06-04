import WindowManager from './window_manager.ts'

export default class Wnd {
  public static HEADER_HEIGHT = 12

  private callback: Function
  private root: HTMLElement
  private titleBar: HTMLElement
  private titleElem: HTMLElement

  public constructor(private wndMgr: WindowManager,
                     width: number, height: number, title: string, content: HTMLElement)
  {
    this.callback = () => {}
    this.root = this.createRoot()
    this.root.className = 'wnd'
    this.root.style.position = 'absolute'
    this.root.style.width = `${width}px`
    this.root.style.height = `${height + Wnd.HEADER_HEIGHT}px`

    this.createTitleBar(title)

    const contentHolder = document.createElement('div')
    contentHolder.className = 'content-holder'
    contentHolder.appendChild(content)
    this.root.appendChild(contentHolder)
  }

  public setPos(x: number, y: number): void {
    this.root.style.left = `${x}px`
    this.root.style.top = `${y}px`
  }

  public setTitle(title: string): void {
    this.titleElem.innerText = title
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
    this.root.classList.add('resizable')

    const W = 8

    const table = [
      {
        styleParams: { right: '-1px', bottom: '-1px', cursor: 'nwse-resize' },
        horz: 'right',
        vert: 'bottom',
      },
      {
        styleParams: { left: '-1px', bottom: '-1px', cursor: 'nesw-resize' },
        horz: 'left',
        vert: 'bottom',
      },
      {
        styleParams: { right: '-1px', top: '-1px', cursor: 'nesw-resize' },
        horz: 'right',
        vert: 'top',
      },
      {
        styleParams: { left: '-1px', top: '-1px', cursor: 'nwse-resize' },
        horz: 'left',
        vert: 'top',
      },
    ]

    const MIN_WIDTH = 64
    const MIN_HEIGHT = 24 + Wnd.HEADER_HEIGHT

    table.forEach(param => {
      const resizeBox = document.createElement('div')
      resizeBox.style.position = 'absolute'
      Object.keys(param.styleParams).forEach(key => {
        resizeBox.style[key] = param.styleParams[key]
      })
      resizeBox.style.width = resizeBox.style.height = `${W}px`
      resizeBox.style.zIndex = '100'

      let dragOfsX, dragOfsY
      const dragMove = (event) => {
        const [x, y] = this.getMousePosIn(event, this.root.parentNode)
        const rect = this.root.getBoundingClientRect()
        const prect = (this.root.parentNode as HTMLElement).getBoundingClientRect()
        const box = {
          left: rect.left - prect.left,
          top: rect.top - prect.top,
          right: rect.right - prect.left,
          bottom: rect.bottom - prect.top,
        }
        box[param.horz] = x + dragOfsX
        box[param.vert] = y + dragOfsY

        let width = box.right - box.left - 2  // For border width.
        let height = box.bottom - box.top - 2
        if (width < MIN_WIDTH) {
          box[param.horz] -= (MIN_WIDTH - width) * (param.horz === 'left' ? 1 : -1)
        }
        if (height < MIN_HEIGHT) {
          box[param.vert] -= (MIN_HEIGHT - height) * (param.vert === 'top' ? 1 : -1)
        }
        this.root.style.width = `${box.right - box.left -  2}px`
        this.root.style.height = `${box.bottom - box.top - 2}px`
        this.root.style.left = `${box.left}px`
        this.root.style.top = `${box.top}px`
        this.callback('resize', width, height - Wnd.HEADER_HEIGHT)
      }
      const dragFinish = (event) => {
        this.root.parentNode.removeEventListener('mousemove', dragMove)
        this.root.parentNode.removeEventListener('mouseup', dragFinish)
      }

      resizeBox.addEventListener('mousedown', (event) => {
        event.stopPropagation()
        event.preventDefault()
        const [x, y] = this.getMousePosIn(event, resizeBox)
        dragOfsX = param.horz === 'left' ? -x : W - x
        dragOfsY = param.vert === 'top' ? -y : W - y

        this.root.parentNode.addEventListener('mousemove', dragMove)
        this.root.parentNode.addEventListener('mouseup', dragFinish)
        this.wndMgr.moveToTop(this)
      })
      this.root.appendChild(resizeBox)
    })
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

  private createTitleBar(title: string): void {
    this.titleBar = document.createElement('div')
    this.titleBar.className = 'title-bar clearfix'

    this.addTitleButton(this.titleBar, 'close', () => {
      this.close()
    })
    this.titleElem = this.addTitle(this.titleBar, title)

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
    this.titleBar.addEventListener('mousedown', (event) => {
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

    this.root.appendChild(this.titleBar)
  }

  private addTitleButton(parent: HTMLElement, className: string,
                         clickCallback: EventListener): HTMLElement
  {
    const button = document.createElement('div')
    button.className = `${className} btn`
    button.addEventListener('click', clickCallback)
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    parent.appendChild(button)
    return button
  }

  private addTitle(parent: HTMLElement, title: string): HTMLElement {
    const titleElem = document.createElement('div')
    titleElem.className = 'title'
    titleElem.appendChild(document.createTextNode(title))
    parent.appendChild(titleElem)
    return titleElem
  }

  private getMousePosIn(event: MouseEvent, elem: HTMLElement) {
    const rect = elem.getBoundingClientRect()
    const scrollLeft = document.body.scrollLeft
    const scrollTop = document.body.scrollTop
    return [event.pageX - rect.left - scrollLeft,
            event.pageY - rect.top - scrollTop]
  }
}
