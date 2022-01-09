import {SubmenuItemInfo} from './types'
import {WndUtil} from './wnd_util'

export class StartMenu {
  private submenuItems: Array<SubmenuItemInfo>
  private itemElem: HTMLElement
  private closeSubmenu: (() => void) | null = null

  public constructor(private root: HTMLElement, private bar: HTMLElement) {
  }

  public setUp(label: string, submenuItems: Array<SubmenuItemInfo>): void {
    this.submenuItems = submenuItems

    this.closeSubmenu = null

    const itemElem = document.createElement('div')
    itemElem.className = 'start-menu-item pull-left'
    itemElem.innerText = label
    itemElem.addEventListener('click', event => {
      event.stopPropagation()
      if (this.closeSubmenu != null) {
        this.closeSubmenu()
        this.onClose()
      } else {
        this.showSubmenu()
      }
    })
    // itemElem.addEventListener('mouseenter', _event => {
    //   if (this.showingSubmenu)
    //     this.showSubmenu()
    // })
    this.itemElem = itemElem
    this.bar.appendChild(itemElem)
  }

  private onClose(): void {
    if (this.closeSubmenu != null) {
      this.itemElem.classList.remove('opened')
      this.closeSubmenu = null
    }
    this.bar.classList.remove('selected')
  }

  private showSubmenu(): void {
    if (this.closeSubmenu != null)
      this.closeSubmenu()

    this.closeSubmenu = this.openSubmenu(this.itemElem, () => this.onClose())
    this.itemElem.classList.add('opened')
    this.bar.classList.add('selected')
  }

  private openSubmenu(itemElem: HTMLElement, onClose?: () => void): () => void {
    const rect = WndUtil.getOffsetRect(this.root, itemElem)
    const pos = {
      left: `${rect.left}px`,
      bottom: '0',
    }
    const option = {
      className: 'start-menu menu-subitem-holder bottom',
      onClose,
    }
    return WndUtil.openSubmenu(this.submenuItems, pos, this.root, option)
  }
}
