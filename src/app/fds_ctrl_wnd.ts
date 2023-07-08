import {DomUtil} from '../util/dom_util'
import {Fds} from '../nes/fds/fds'
import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'

export class FdsCtrlWnd extends Wnd {
  private sideCount = 0
  private select: HTMLSelectElement

  constructor(wndMgr: WindowManager, private fds: Fds) {
    super(wndMgr, 80, 30, 'FDS Ctrl')

    this.select = this.createUi()
    if (!this.checkSideCount()) {
      this.select.addEventListener('click', () => {
        this.checkSideCount()
      })
    }

    wndMgr.add(this)
  }

  private checkSideCount(): boolean {
    if (this.sideCount !== 0)
      return false
    const count = this.fds.getSideCount()
    if (count <= 0)
      return false
    this.sideCount = count
    this.createOptions(this.select, count)
    return true
  }

  private createUi(): HTMLSelectElement {
    const content = document.createElement('div')
    content.className = 'full-size'
    DomUtil.setStyles(content, {
      display: 'flex',
      alignItems: 'center',
    })
    const select = document.createElement('select')
    DomUtil.setStyles(select, {
      margin: 'auto',
    })
    content.appendChild(select)
    this.setContent(content)
    return select
  }

  private createOptions(select: HTMLSelectElement, sideCount: number): void {
    {
      const option = document.createElement('option')
      option.innerText = 'Eject'
      select.appendChild(option)
    }

    const side = ['A', 'B']
    for (let i = 0; i < sideCount; ++i) {
      const option = document.createElement('option')
      option.innerText = `${((i / 2) | 0) + 1}-${side[i & 1]}`
      select.appendChild(option)
    }
    if (sideCount > 0)
      select.value = '1-A'

    select.addEventListener('change', () => {
      const index = select.selectedIndex
      this.fds.eject()
      if (index > 0) {
        setTimeout(() => {
          this.fds.setSide(index - 1)
        }, 1200)
      }
    })
  }
}
