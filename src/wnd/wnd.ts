import DomUtil from '../util/dom_util'
import Util from '../util/util'
import WindowManager from './window_manager'

const Z_MENUBAR = 1000
const Z_MENU_SUBITEM = Z_MENUBAR + 1

function getOffsetRect(parent: HTMLElement, target: HTMLElement) {
  const prect = parent.getBoundingClientRect()
  const trect = target.getBoundingClientRect()
  return {
    left: trect.left - prect.left,
    top: trect.top - prect.top,
    right: trect.right - prect.left,
    bottom: trect.bottom - prect.top,
  }
}

function createHorizontalSplitter(parent: HTMLElement, upperHeight: number) {
  const upper = document.createElement('div')
  upper.className = 'upper'
  DomUtil.setStyles(upper, {
    position: 'absolute',
    overflow: 'hidden',
    left: 0,
    top: 0,
    right: 0,
    height: `${upperHeight}px`,
  })

  const lower = document.createElement('div')
  lower.className = 'lower'
  DomUtil.setStyles(lower, {
    position: 'absolute',
    overflow: 'hidden',
    left: 0,
    bottom: 0,
    right: 0,
    top: `${upperHeight}px`,
  })

  parent.appendChild(upper)
  parent.appendChild(lower)

  return [upper, lower]
}

export default class Wnd {
  public static TITLEBAR_HEIGHT = 14
  public static MENUBAR_HEIGHT = 14

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
    this.root = this.createRoot()
    this.root.className = 'wnd'
    this.root.style.position = 'absolute'

    const [upper, lower] = createHorizontalSplitter(this.root, Wnd.TITLEBAR_HEIGHT)
    this.clientMarginHeight += Wnd.TITLEBAR_HEIGHT

    this.titleBar = this.createTitleBar(title)
    upper.appendChild(this.titleBar)

    this.contentHolder = lower

    this.setClientSize(width, height)
  }

  public setContent(content: HTMLElement): Wnd {
    DomUtil.removeAllChildren(this.contentHolder)
    this.contentHolder.appendChild(content)
    return this
  }

  public getContentHolder(): HTMLElement {
    return this.contentHolder
  }

  public getRootElement(): HTMLElement {
    return this.root
  }

  public setPos(x: number, y: number): Wnd {
    DomUtil.setStyles(this.root, {
      left: `${x}px`,
      top: `${y}px`,
    })
    return this
  }

  public setTitle(title: string): Wnd {
    this.titleElem.innerText = title
    return this
  }

  public setClientSize(width: number, height: number): Wnd {
    DomUtil.setStyles(this.root, {
      width: `${width + this.clientMarginWidth}px`,
      height: `${height + this.clientMarginHeight}px`,
    })
    return this
  }

  public getWindowSize(): {width: number, height: number} {
    const width = parseInt(this.root.style.width || '-1', 10)
    const height = parseInt(this.root.style.height || '-1', 10)
    return { width, height }
  }

  protected onEvent(_action: string, _param?: any): any {
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

    const itemElems: HTMLElement[] = []
    let activeSubmenuIndex = -1
    let submenuHandler: any

    const onClose = () => {
      activeSubmenuIndex = -1
      submenuHandler = null
      this.onEvent('closeMenu')
    }

    const showSubmenu = (index: number) => {
      const menuItem = menu[index]
      if (!('submenu' in menuItem) || activeSubmenuIndex === index)
        return

      if (submenuHandler != null) {
        submenuHandler.close()
      }

      const itemElem = itemElems[index]
      activeSubmenuIndex = index
      submenuHandler = this.openSubmenu(menuItem, itemElem, onClose)
    }

    menu.forEach((menuItem: any, index: number) => {
      const itemElem = document.createElement('div')
      itemElem.className = 'menu-item pull-left'
      itemElem.innerText = menuItem.label
      itemElem.style.height = '100%'
      itemElem.addEventListener('click', (event) => {
        event.stopPropagation()
        if ('submenu' in menuItem) {
          if (activeSubmenuIndex < 0) {
            this.onEvent('openMenu')
            showSubmenu(index)
          } else {
            submenuHandler.close()
            onClose()
          }
        }
      })
      this.menuBar.appendChild(itemElem)
      itemElems.push(itemElem)

      itemElem.addEventListener('mouseenter', (_event) => {
        if (activeSubmenuIndex >= 0 && activeSubmenuIndex !== index && 'submenu' in menuItem) {
          showSubmenu(index)
        }
      })
    })
    upper.appendChild(this.menuBar)

    this.contentHolder = lower

    return this
  }

  public getRootNode(): HTMLElement {
    return this.root
  }

  public close(): void {
    if (this.onEvent('close') === false)
      return  // Cancel close
    this.wndMgr.remove(this)
    // this.root = null
  }

  public addResizeBox() {
    this.root.classList.add('resizable')

    this.addTitleButton(this.titleBar, 'maximize', () => {
      this.maximize()
    })

    const W = 8

    const table: {styleParams: {[key: string]: string}, horz: 'left'|'right', vert: 'top'|'bottom'}[] = [
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

    const MIN_WIDTH = 80
    const MIN_HEIGHT = 60 + Wnd.TITLEBAR_HEIGHT

    table.forEach(param => {
      const resizeBox = document.createElement('div')
      resizeBox.style.position = 'absolute'
      Object.keys(param.styleParams).forEach((key: string) => {
        resizeBox.style[key] = param.styleParams[key]
      })
      DomUtil.setStyles(resizeBox, {
        width: `${W}px`,
        height: `${W}px`,
        zIndex: '100',
      })
      resizeBox.addEventListener('mousedown', (event) => {
        event.stopPropagation()
        event.preventDefault()
        if (event.button !== 0)
          return false
        const [mx, my] = DomUtil.getMousePosIn(event, resizeBox)
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

        this.onEvent('resize-begin')

        DomUtil.setMouseDragListener({
          move: (event2: MouseEvent) => {
            let [x, y] = DomUtil.getMousePosIn(event2, this.root.parentNode as HTMLElement)
            x = Util.clamp(x, -dragOfsX, window.innerWidth - dragOfsX)
            y = Util.clamp(y, -dragOfsY, window.innerHeight - dragOfsY)
            box[param.horz] = x + dragOfsX
            box[param.vert] = y + dragOfsY

            let width = box.right - box.left - 2  // For border width.
            let height = box.bottom - box.top - 2
            if (width < MIN_WIDTH) {
              box[param.horz] -= (MIN_WIDTH - width) * (param.horz === 'left' ? 1 : -1)
              width = MIN_WIDTH
            }
            if (height < MIN_HEIGHT) {
              box[param.vert] -= (MIN_HEIGHT - height) * (param.vert === 'top' ? 1 : -1)
              height = MIN_HEIGHT
            }
            DomUtil.setStyles(this.root, {
              width: `${Math.round(box.right - box.left -  2)}px`,
              height: `${Math.round(box.bottom - box.top - 2)}px`,
              left: `${Math.round(box.left)}px`,
              top: `${Math.round(box.top)}px`,
            })
            this.onEvent('resize', {width, height: height - Wnd.TITLEBAR_HEIGHT})
          },
          up: (_event2: MouseEvent) => {
            this.root.style['transition-property'] = null
            this.onEvent('resize-end')
          },
        })

        this.wndMgr.moveToTop(this)

        this.root.style['transition-property'] = 'none'  // To change size immediately.
        return true
      })
      this.root.appendChild(resizeBox)
    })
  }

  protected maximize() {
    this.setPos(0, 0)
    const width = window.innerWidth - 2  // -2 for border size
    const height = window.innerHeight - Wnd.TITLEBAR_HEIGHT - (this.menuBar != null ? Wnd.MENUBAR_HEIGHT : 0) - 2
    this.setClientSize(width, height)
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

    this.titleElem = this.addTitle(titleBar, title)

    this.addTitleButton(titleBar, 'close', () => {
      this.close()
    })

    titleBar.addEventListener('mousedown', (event) => {
      if (event.button !== 0)
        return false

      // Move window position with dragging.
      event.preventDefault()
      let [mx, my] = DomUtil.getMousePosIn(event, this.root)
      const dragOfsX = -mx
      const dragOfsY = -my
      const winSize = this.getWindowSize()
      DomUtil.setMouseDragListener({
        move: (event2: MouseEvent) => {
          let [x, y] = DomUtil.getMousePosIn(event2, this.root.parentNode as HTMLElement)
          x = Util.clamp(x, -dragOfsX, window.innerWidth - winSize.width - dragOfsX)
          y = Util.clamp(y, -dragOfsY, window.innerHeight - winSize.height - dragOfsY)

          DomUtil.setStyles(this.root, {
            left: `${Math.round(x + dragOfsX)}px`,
            top: `${Math.round(y + dragOfsY)}px`,
          })
        },
      })
      return true
    })
    return titleBar
  }

  private addTitleButton(parent: HTMLElement, className: string,
                         clickCallback: EventListener): HTMLElement
  {
    const button = document.createElement('div')
    button.className = `${className} btn`
    button.title = className
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

  private openSubmenu(menuItem: any, itemElem: HTMLElement, onClose?: Function): any {
    const subItemHolder = document.createElement('div')
    subItemHolder.className = 'menu-subitem-holder'
    subItemHolder.style.zIndex = String(Z_MENU_SUBITEM)
    menuItem.submenu.forEach((submenuItem: {label: string, checked: boolean, disabled: boolean, click?: () => void}) => {
      const submenuRow = document.createElement('div')
      submenuRow.className = 'submenu-row clearfix'

      if (submenuItem.checked) {
        const checked = document.createElement('div')
        checked.className = 'submenu-check'
        submenuRow.appendChild(checked)
      }

      const subItemElem = document.createElement('div')
      subItemElem.innerText = submenuItem.label
      if (submenuItem.disabled) {
        subItemElem.className = 'menu-item disabled'
      } else {
        subItemElem.className = 'menu-item'
        subItemElem.addEventListener('click', (_event) => {
          if (submenuItem.click)
            submenuItem.click()
        })
      }
      submenuRow.appendChild(subItemElem)
      subItemHolder.appendChild(submenuRow)
    })
    this.root.appendChild(subItemHolder)

    const rect = getOffsetRect(this.root, itemElem)
    DomUtil.setStyles(subItemHolder, {
      left: `${rect.left - 1}px`,  // For border size
      top: `${rect.bottom - 1}px`,
    })

    const close = () => {
      if (subItemHolder.parentNode != null)
        subItemHolder.parentNode.removeChild(subItemHolder)
      document.removeEventListener('click', onClickOther)
    }

    // To handle earlier than menu open, pass useCapture=true
    const onClickOther = (_event: MouseEvent) => {
      close()
      if (onClose != null)
        onClose()
    }
    document.addEventListener('click', onClickOther /*, true*/)

    return {
      close,
    }
  }
}
