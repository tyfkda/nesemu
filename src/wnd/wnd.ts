import Util from '../util/util'
import WindowManager from './window_manager'

const Z_MENUBAR = 1000
const Z_MENU_SUBITEM = Z_MENUBAR + 1

function getOffsetRect(parent, target) {
  const prect = parent.getBoundingClientRect()
  const trect = target.getBoundingClientRect()
  return {
    left: trect.left - prect.left,
    top: trect.top - prect.top,
    right: trect.right - prect.left,
    bottom: trect.bottom - prect.top,
  }
}

function createHorizontalSplitter(parent, upperHeight) {
  const upper = document.createElement('div')
  upper.className = 'upper'
  upper.style.position = 'absolute'
  upper.style.overflow = 'hidden'
  upper.style.left = upper.style.top = upper.style.right = '0'
  upper.style.height = `${upperHeight}px`

  const lower = document.createElement('div')
  lower.className = 'lower'
  lower.style.position = 'absolute'
  lower.style.overflow = 'hidden'
  lower.style.left = lower.style.bottom = lower.style.right = '0'
  lower.style.top = `${upperHeight}px`

  parent.appendChild(upper)
  parent.appendChild(lower)

  return [upper, lower]
}

export default class Wnd {
  public static TITLEBAR_HEIGHT = 12
  public static MENUBAR_HEIGHT = 12

  protected callback: Function
  protected contentHolder: HTMLElement
  private root: HTMLElement
  private titleBar: HTMLElement
  private titleElem: HTMLElement
  private menuBar: HTMLElement
  private clientMarginWidth: number = 0
  private clientMarginHeight: number = 0
  private bTop: boolean = false

  public constructor(protected wndMgr: WindowManager, width: number, height: number,
                     title: string)
  {
    this.callback = () => {}
    this.root = this.createRoot()
    this.root.className = 'wnd'
    this.root.style.position = 'absolute'

    const [upper, lower] = createHorizontalSplitter(this.root, Wnd.TITLEBAR_HEIGHT)
    this.clientMarginHeight += Wnd.TITLEBAR_HEIGHT

    this.createTitleBar(title)
    upper.appendChild(this.titleBar)

    this.contentHolder = lower

    this.setClientSize(width, height)
  }

  public setContent(content: HTMLElement): Wnd {
    Util.removeAllChildren(this.contentHolder)
    this.contentHolder.appendChild(content)
    return this
  }

  public getRootElement(): HTMLElement {
    return this.root
  }

  public setPos(x: number, y: number): Wnd {
    this.root.style.left = `${x}px`
    this.root.style.top = `${y}px`
    return this
  }

  public setTitle(title: string): Wnd {
    this.titleElem.innerText = title
    return this
  }

  public setClientSize(width: number, height: number): Wnd {
    this.root.style.width = `${width + this.clientMarginWidth}px`
    this.root.style.height = `${height + this.clientMarginHeight}px`
    return this
  }

  public getWindowSize(): {width: number, height: number} {
    const width = parseInt(this.root.style.width, 10)
    const height = parseInt(this.root.style.height, 10)
    return { width, height }
  }

  public setCallback(callback: Function): Wnd {
    this.callback = callback
    return this
  }

  public setFocus(): Wnd {
    this.root.focus()
    return this
  }

  public isTop(): boolean {
    return this.bTop
  }

  public setTop(value: boolean): void {
    this.bTop = value
    if (value)
      this.root.classList.add('top')
    else
      this.root.classList.remove('top')
  }

  public addMenuBar(menu: any): Wnd {
    const [upper, lower] = createHorizontalSplitter(this.root, Wnd.MENUBAR_HEIGHT)
    this.clientMarginHeight += Wnd.TITLEBAR_HEIGHT
    this.contentHolder.appendChild(upper)
    this.contentHolder.appendChild(lower)

    this.menuBar = document.createElement('div')
    this.menuBar.className = 'menu-bar'
    this.menuBar.style.zIndex = String(Z_MENUBAR)

    menu.forEach(menuItem => {
      const itemElem = document.createElement('div')
      itemElem.className = 'menu-item pull-left'
      itemElem.innerText = menuItem.label
      itemElem.addEventListener('click', (event) => {
        if ('submenu' in menuItem) {
          this.addSubmenu(menuItem, itemElem)
        }
      })
      this.menuBar.appendChild(itemElem)
    })
    upper.appendChild(this.menuBar)

    this.contentHolder = lower

    return this
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
    const MIN_HEIGHT = 24 + Wnd.TITLEBAR_HEIGHT

    table.forEach(param => {
      const resizeBox = document.createElement('div')
      resizeBox.style.position = 'absolute'
      Object.keys(param.styleParams).forEach(key => {
        resizeBox.style[key] = param.styleParams[key]
      })
      resizeBox.style.width = resizeBox.style.height = `${W}px`
      resizeBox.style.zIndex = '100'
      resizeBox.addEventListener('mousedown', (event) => {
        event.stopPropagation()
        event.preventDefault()
        const [mx, my] = this.getMousePosIn(event, resizeBox)
        const dragOfsX = param.horz === 'left' ? -mx : W - mx
        const dragOfsY = param.vert === 'top' ? -my : W - my
        const rect = this.root.getBoundingClientRect()
        const prect = (this.root.parentNode as HTMLElement).getBoundingClientRect()
        const box = {
          left: rect.left - prect.left,
          top: rect.top - prect.top,
          right: rect.right - prect.left,
          bottom: rect.bottom - prect.top,
        }

        const dragMove = (event) => {
          let [x, y] = this.getMousePosIn(event, this.root.parentNode as HTMLElement)
          x = Util.clamp(x, -dragOfsX, window.innerWidth - dragOfsX)
          y = Util.clamp(y, -dragOfsY, window.innerHeight - dragOfsY)
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
          this.callback('resize', width, height - Wnd.TITLEBAR_HEIGHT)
        }
        const dragFinish = (event) => {
          document.removeEventListener('mousemove', dragMove)
          document.removeEventListener('mouseup', dragFinish)
          this.root.style['transition-property'] = null
        }

        document.addEventListener('mousemove', dragMove)
        document.addEventListener('mouseup', dragFinish)
        this.wndMgr.moveToTop(this)

        this.root.style['transition-property'] = 'none'  // To change size immediately.
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

    this.titleBar.addEventListener('mousedown', (event) => {
      if (event.button !== 0)
        return false

      // Move window position with dragging.
      event.preventDefault()
      let [mx, my] = this.getMousePosIn(event, this.root)
      const dragOfsX = -mx
      const dragOfsY = -my
      const winSize = this.getWindowSize()
      const dragMove = (event) => {
        let [x, y] = this.getMousePosIn(event, this.root.parentNode as HTMLElement)
        x = Util.clamp(x, -dragOfsX, window.innerWidth - winSize.width - dragOfsX)
        y = Util.clamp(y, -dragOfsY, window.innerHeight - winSize.height - dragOfsY)

        this.root.style.left = `${x + dragOfsX}px`
        this.root.style.top = `${y + dragOfsY}px`
      }
      const dragFinish = (event) => {
        document.removeEventListener('mousemove', dragMove)
        document.removeEventListener('mouseup', dragFinish)
      }

      document.addEventListener('mousemove', dragMove)
      document.addEventListener('mouseup', dragFinish)
      return true
    })
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

  private addSubmenu(menuItem, itemElem) {
    const subItemHolder = document.createElement('div')
    subItemHolder.className = 'menu-subitem-holder'
    subItemHolder.style.zIndex = String(Z_MENU_SUBITEM)
    menuItem.submenu.forEach(submenuItem => {
      const subItemElem = document.createElement('div')
      subItemElem.className = 'menu-item'
      subItemElem.innerText = submenuItem.label
      subItemElem.addEventListener('click', (event) => {
        event.stopPropagation()
        if ('click' in submenuItem)
          submenuItem.click()
      })
      subItemHolder.appendChild(subItemElem)
    })
    this.root.appendChild(subItemHolder)

    const rect = getOffsetRect(this.root, itemElem)
    subItemHolder.style.left = `${rect.left - 1}px`  // For border size
    subItemHolder.style.top = `${rect.bottom - 1}px`

    // To handle earlier than menu open, pass useCapture=true
    const onClickOther = (event) => {
      subItemHolder.parentNode.removeChild(subItemHolder)
      document.removeEventListener('click', onClickOther, true)
    }
    document.addEventListener('click', onClickOther, true)
  }

  private getMousePosIn(event: MouseEvent, elem: HTMLElement) {
    const rect = elem.getBoundingClientRect()
    const scrollLeft = document.body.scrollLeft
    const scrollTop = document.body.scrollTop
    return [event.pageX - rect.left - scrollLeft,
            event.pageY - rect.top - scrollTop]
  }
}
