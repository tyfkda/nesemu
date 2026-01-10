import {DomUtil} from '../util/dom_util'
import {WindowManager} from './window_manager'
import {Util} from '../util/util'
import {WndUtil, ResizeOption} from './wnd_util'
import {MenuItemInfo, WndEvent, Z_MENUBAR} from './types'

const WIN_BORDER = 1

export class Wnd {
  public static TITLEBAR_HEIGHT = 20
  public static MENUBAR_HEIGHT = 14

  protected contentHolder: HTMLElement
  private root: HTMLElement
  private titleBar: HTMLElement
  private titleBtnHolder: HTMLElement
  private titleElem: HTMLElement
  private menuBar: HTMLElement
  private clientMarginWidth = 0
  private clientMarginHeight = 0

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

  public setContent(content: HTMLElement): void {
    DomUtil.removeAllChildren(this.contentHolder)
    this.contentHolder.appendChild(content)
  }

  public getContentHolder(): HTMLElement {
    return this.contentHolder
  }

  public getRootElement(): HTMLElement {
    return this.root
  }

  public setPos(x: number, y: number): void {
    const rootRect = this.wndMgr.getRootClientRect()
    const {width, height} = this.getWindowSize()
    x = Util.clamp(x, rootRect.left, rootRect.right - width)
    y = Util.clamp(y, rootRect.top, rootRect.bottom - height)

    DomUtil.setStyles(this.root, {
      left: `${x}px`,
      top: `${y}px`,
    })
  }

  public getPos(): {x: number, y: number} {
    const element = this.root
    const x = parseInt(element.style.left || '-1', 10)
    const y = parseInt(element.style.top || '-1', 10)
    return { x: x, y: y }
  }

  public setTitle(title: string): void {
    this.titleElem.innerText = title
  }

  public setWindowSize(width: number, height: number): void {
    const rect = this.root.getBoundingClientRect()
    const rootRect = this.wndMgr.getRootClientRect()

    const styles: Record<string, unknown> = {
      width: `${width}px`,
      height: `${height}px`,
    }

    const left = Util.clamp(rect.left, 0, Math.floor(rootRect.width - width - WIN_BORDER * 2))
    const top = Util.clamp(rect.top, 0, Math.floor(rootRect.height - height - WIN_BORDER * 2))
    if (left !== rect.left)
      styles['left'] = `${left}px`
    if (top !== rect.top)
      styles['top'] = `${top}px`

    DomUtil.setStyles(this.root, styles)
  }

  public setClientSize(width: number, height: number): void {
    this.setWindowSize(width + this.clientMarginWidth,
                       height + this.clientMarginHeight)
  }

  public getClientSize(): {width: number, height: number} {
    const rect = this.root.getBoundingClientRect()
    return {
      width: rect.width - this.clientMarginWidth,
      height: rect.height - this.clientMarginHeight,
    }
  }

  public clampPos(rootRect: DOMRect): void {
    const rect = this.root.getBoundingClientRect()
    const left = Util.clamp(rect.left, 0, Math.floor(rootRect.width - rect.width))
    const top = Util.clamp(rect.top, 0, Math.floor(rootRect.height - rect.height))
    if (left !== rect.left || top !== rect.top) {
      const styles: Record<string, unknown> = {}
      if (left !== rect.left)
        styles['left'] = `${left}px`
      if (top !== rect.top)
        styles['top'] = `${top}px`
      DomUtil.setStyles(this.root, styles)
    }
  }

  public getWindowSize(): {width: number; height: number} {
    const width = parseInt(this.root.style.width || '-1', 10)
    const height = parseInt(this.root.style.height || '-1', 10)
    return {width, height}
  }

  public onEvent(_event: WndEvent, _param?: any): any {}

  public isTop(): boolean {
    return this.wndMgr.isTop(this)
  }

  public setTop(value: boolean): void {
    if (value)
      this.root.classList.add('top')
    else
      this.root.classList.remove('top')
  }

  public addMenuBar(menu: Array<MenuItemInfo>): void {
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
        this.onEvent(WndEvent.CLOSE_MENU)
      }
      closeSubmenu = null
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
        menuItem.submenu, pos, this.root, option)
      itemElem.classList.add('opened')
    }

    const onClickMenu = (menuItem: MenuItemInfo, index: number) => {
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
    }

    menu.forEach((menuItem: MenuItemInfo, index: number) => {
      const itemElem = document.createElement('div')
      itemElem.className = 'menu-item pull-left'
      itemElem.innerText = menuItem.label
      itemElem.style.height = '100%'
      itemElem.addEventListener('click', event => {
        event.stopPropagation()
        onClickMenu(menuItem, index)
      })
      itemElem.addEventListener('mouseenter', _event => {
        if (activeSubmenuIndex >= 0 && activeSubmenuIndex !== index && 'submenu' in menuItem) {
          showSubmenu(index)
        }
      })
      itemElem.addEventListener('touchstart', event => {
        if (event.changedTouches[0].identifier === 0) {
          event.preventDefault()
          itemElem.classList.add('opened')
        }
      }, {passive: false})
      itemElem.addEventListener('touchend', event => {
        if (event.changedTouches[0].identifier === 0) {
          const [x, y] = DomUtil.getMousePosIn(event, itemElem)
          const rect = itemElem.getBoundingClientRect()
          if (x >= 0 && y >= 0 && x < rect.width && y < rect.height) {
            if (activeSubmenuIndex < 0 || activeSubmenuIndex === index)
              onClickMenu(menuItem, index)
            else
              showSubmenu(index)
          } else {
            if (activeSubmenuIndex !== index)
              itemElem.classList.remove('opened')
          }
        }
      })

      this.menuBar.appendChild(itemElem)
      itemElems.push(itemElem)
    })
    upper.appendChild(this.menuBar)

    this.contentHolder = lower
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

  public addResizeBox(opt?: ResizeOption): void {
    this.root.classList.add('resizable')

    this.addTitleButton(this.titleBtnHolder, 'maximize', () => {
      this.wndMgr.moveToTop(this)
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
      }, opt)
  }

  protected maximize(): void {
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

  private createTitleBar(title: string): {titleBar: HTMLElement, titleBtnHolder: HTMLElement, titleElem: HTMLElement} {
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
      () => {
        const rc = this.wndMgr.getRootClientRect()
        return new DOMRect(rc.x, rc.y, rc.width - WIN_BORDER * 2, rc.height - WIN_BORDER * 2)
      },
      (event, param?) => {
        switch (event) {
        case WndEvent.DRAG_BEGIN:
          this.root.style.transitionProperty = 'none'  // To change position immediately.
          this.wndMgr.moveToTop(this)
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
    button.addEventListener('touchstart', event => {
      event.stopPropagation()
    }, {passive: true})
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
