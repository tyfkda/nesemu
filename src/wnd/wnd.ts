import DomUtil from '../util/dom_util'
import WindowManager from './window_manager'
import WndUtil from './wnd_util'
import {MenuItemInfo, WndEvent, Z_MENUBAR} from './types'

export default class Wnd {
  public static TITLEBAR_HEIGHT = 20
  public static MENUBAR_HEIGHT = 14

  protected contentHolder: HTMLElement
  private root: HTMLElement
  private titleBar: HTMLElement
  private titleBtnHolder: HTMLElement
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

    const [upper, lower] = WndUtil.createHorizontalSplitter(this.root, Wnd.TITLEBAR_HEIGHT)
    this.clientMarginHeight += Wnd.TITLEBAR_HEIGHT

    const {titleBar, titleBtnHolder, titleElem} = this.createTitleBar(title)
    this.titleBar = titleBar
    this.titleBtnHolder = titleBtnHolder
    this.titleElem = titleElem
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

  public getWindowSize(): {width: number; height: number} {
    const width = parseInt(this.root.style.width || '-1', 10)
    const height = parseInt(this.root.style.height || '-1', 10)
    return {width, height}
  }

  public onEvent(_event: WndEvent, _param?: any): any {}

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

  public addMenuBar(menu: Array<MenuItemInfo>): Wnd {
    const [upper, lower] = WndUtil.createHorizontalSplitter(this.root, Wnd.MENUBAR_HEIGHT)
    this.clientMarginHeight += Wnd.MENUBAR_HEIGHT
    this.contentHolder.appendChild(upper)
    this.contentHolder.appendChild(lower)

    this.menuBar = document.createElement('div')
    this.menuBar.className = 'menu-bar'
    this.menuBar.style.zIndex = String(Z_MENUBAR)

    const itemElems: HTMLElement[] = []
    let activeSubmenuIndex = -1
    let closeSubmenu: (() => void) | null

    const onClose = () => {
      if (activeSubmenuIndex >= 0) {
        const prev = itemElems[activeSubmenuIndex]
        prev.classList.remove('opened')
        activeSubmenuIndex = -1
      }
      closeSubmenu = null
      this.onEvent(WndEvent.CLOSE_MENU)
    }

    const showSubmenu = (index: number) => {
      const menuItem = menu[index]
      if (!('submenu' in menuItem) || activeSubmenuIndex === index)
        return

      if (closeSubmenu != null)
        closeSubmenu()

      if (activeSubmenuIndex >= 0) {
        const prev = itemElems[activeSubmenuIndex]
        prev.classList.remove('opened')
      }
      const itemElem = itemElems[index]
      activeSubmenuIndex = index

      const rect = WndUtil.getOffsetRect(this.root, itemElem)
      const pos = {
        left: `${rect.left - 1}px`,  // For border size
        top: `${rect.bottom - 1}px`,
      }
      const option = {
        className: 'menu-subitem-holder',
        onClose,
      }
      closeSubmenu = WndUtil.openSubmenu(
        menuItem, pos, this.root, option)
      itemElem.classList.add('opened')
    }

    menu.forEach((menuItem: MenuItemInfo, index: number) => {
      const itemElem = document.createElement('div')
      itemElem.className = 'menu-item pull-left'
      itemElem.innerText = menuItem.label
      itemElem.style.height = '100%'
      itemElem.addEventListener('click', event => {
        event.stopPropagation()
        if ('submenu' in menuItem) {
          if (activeSubmenuIndex < 0) {
            this.onEvent(WndEvent.OPEN_MENU)
            showSubmenu(index)
          } else {
            if (closeSubmenu)
              closeSubmenu()
            onClose()
          }
        }
      })
      this.menuBar.appendChild(itemElem)
      itemElems.push(itemElem)

      itemElem.addEventListener('mouseenter', _event => {
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
    if (this.onEvent(WndEvent.CLOSE) === false)
      return  // Cancel close
    this.wndMgr.remove(this)
    // this.root = null
  }

  public addResizeBox() {
    this.root.classList.add('resizable')

    this.addTitleButton(this.titleBtnHolder, 'maximize', () => {
      this.maximize()
    })

    WndUtil.makeResizable(
      this.root,
      () => this.wndMgr.getRootClientRect(),
      (event, param?) => {
        switch (event) {
        case WndEvent.RESIZE_BEGIN:
          this.wndMgr.moveToTop(this)
          this.root.style.transitionProperty = 'none'  // To change size immediately.
          break
        case WndEvent.RESIZE_END:
          this.root.style.transitionProperty = ''
          break
        }
        this.onEvent(event, param)
      })
  }

  protected maximize() {
    this.setPos(0, 0)
    const menubarHeight = this.menuBar != null ? Wnd.MENUBAR_HEIGHT : 0
    const rootRect = this.wndMgr.getRootClientRect()
    const width = rootRect.width - 2  // -2 for border size
    const height = rootRect.height - (Wnd.TITLEBAR_HEIGHT + menubarHeight) - 2
    this.setClientSize(width, height)
  }

  private createRoot(): HTMLElement {
    const root = document.createElement('div')
    root.addEventListener('mousedown', event => {
      if (event.button === 0) {
        event.stopPropagation()
        this.wndMgr.moveToTop(this)
      }
      return false
    })
    return root
  }

  private createTitleBar(title: string) {
    const titleBar = document.createElement('div')
    titleBar.className = 'title-bar'

    const titleElem = this.addTitle(titleBar, title)

    const titleBtnHolder = document.createElement('div')
    titleBtnHolder.className = 'title-btn-holder'
    titleBar.appendChild(titleBtnHolder)

    this.addTitleButton(titleBtnHolder, 'close', () => {
      this.close()
    })

    WndUtil.makeDraggable(
      this.root, titleBar,
      () => this.wndMgr.getRootClientRect(),
      (event, param?) => {
        switch (event) {
        case WndEvent.DRAG_BEGIN:
          this.root.style.transitionProperty = 'none'  // To change position immediately.
          break
        case WndEvent.DRAG_END:
          this.root.style.transitionProperty = ''
          break
        }
        this.onEvent(event, param)
      })
    return {titleBar, titleBtnHolder, titleElem}
  }

  private addTitleButton(parent: HTMLElement, className: string,
                         clickCallback: EventListener): HTMLElement
  {
    const button = document.createElement('div')
    button.className = `${className} btn`
    button.title = className
    button.addEventListener('click', clickCallback)
    button.addEventListener('mousedown', event => {
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
}
