import DomUtil from '../util/dom_util'
import Util from '../util/util'
import {MenuItemInfo, WndEvent, Z_MENU_SUBITEM} from './types'
import Wnd from './wnd'

export default class WndUtil {
  public static getOffsetRect(
    parent: HTMLElement, target: HTMLElement,
  ): {left: number; top: number; right: number; bottom: number} {
    const prect = parent.getBoundingClientRect()
    const trect = target.getBoundingClientRect()
    return {
      left: trect.left - prect.left,
      top: trect.top - prect.top,
      right: trect.right - prect.left,
      bottom: trect.bottom - prect.top,
    }
  }

  public static createHorizontalSplitter(
    parent: HTMLElement, upperHeight: number,
  ): [HTMLElement, HTMLElement] {
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

  public static makeDraggable(
    element: HTMLElement, grip: HTMLElement, getClientRect: () => DOMRect,
    onEvent: (event: WndEvent, param?: any) => void,
  ): void {
    grip.addEventListener('mousedown', event => {
      if (event.button !== 0)
        return false

      onEvent(WndEvent.DRAG_BEGIN)

      const rootRect = getClientRect()

      event.preventDefault()
      const [mx, my] = DomUtil.getMousePosIn(event, element)
      const dragOfsX = -mx
      const dragOfsY = -my

      const width = parseInt(element.style.width || '-1', 10)
      const height = parseInt(element.style.height || '-1', 10)

      const pos = {x: mx, y: my}
      DomUtil.setMouseDragListener({
        move: (event2: MouseEvent) => {
          const [x, y] = DomUtil.getMousePosIn(event2, element.parentNode as HTMLElement)
          pos.x = Util.clamp(x + dragOfsX, 0, Math.floor(rootRect.width - width))
          pos.y = Util.clamp(y + dragOfsY, 0, Math.floor(rootRect.height - height))

          DomUtil.setStyles(element, {
            left: `${Math.round(pos.x)}px`,
            top: `${Math.round(pos.y)}px`,
          })
          onEvent(WndEvent.DRAG_MOVE, pos)
        },
        up: (_event2: MouseEvent) => {
          onEvent(WndEvent.DRAG_END)
        },
      })
      return true
    })
  }

  public static makeResizable(
    element: HTMLElement, getClientRect: () => DOMRect,
    onEvent: (event: WndEvent, param?: any) => void,
  ): void {
    const MIN_WIDTH = 80
    const MIN_HEIGHT = 60 + Wnd.TITLEBAR_HEIGHT
    const W = 8

    type StyleParams = {left?: string, right?: string, top?: string, bottom?: string, cursor?: string}
    type Horz = 'left'|'right'|'center'
    type Vert = 'top'|'bottom'|'center'
    const table: Array<{styleParams: StyleParams, horz: Horz, vert: Vert}> = [
      // Corners
      {
        styleParams: {right: '-1px', bottom: '-1px', cursor: 'nwse-resize'},
        horz: 'right',
        vert: 'bottom',
      },
      {
        styleParams: {left: '-1px', bottom: '-1px', cursor: 'nesw-resize'},
        horz: 'left',
        vert: 'bottom',
      },
      {
        styleParams: {right: '-1px', top: '-1px', cursor: 'nesw-resize'},
        horz: 'right',
        vert: 'top',
      },
      {
        styleParams: {left: '-1px', top: '-1px', cursor: 'nwse-resize'},
        horz: 'left',
        vert: 'top',
      },
      // Edges
      {
        styleParams: {left: `${W}px`, right: `${W}px`, top: `-${W - 4}px`, cursor: 'ns-resize'},
        horz: 'center',
        vert: 'top',
      },
      {
        styleParams: {left: `${W}px`, right: `${W}px`, bottom: '-1px', cursor: 'ns-resize'},
        horz: 'center',
        vert: 'bottom',
      },
      {
        styleParams: {top: `${W}px`, bottom: `${W}px`, left: '-1px', cursor: 'ew-resize'},
        horz: 'left',
        vert: 'center',
      },
      {
        styleParams: {top: `${W}px`, bottom: `${W}px`, right: '-1px', cursor: 'ew-resize'},
        horz: 'right',
        vert: 'center',
      },
    ]

    table.forEach(param => {
      const resizeBox = document.createElement('div')
      resizeBox.className = 'resize-box'
      ;(Object.keys(param.styleParams) as (keyof StyleParams)[]).forEach(key => {
        resizeBox.style[key] = param.styleParams[key]!
      })
      DomUtil.setStyles(resizeBox, {
        width: param.horz !== 'center' ? `${W}px` : undefined,
        height: param.vert !== 'center' ? `${W}px` : undefined,
        zIndex: '2000',
      })
      resizeBox.addEventListener('mousedown', event => {
        if (event.button !== 0)
          return false

        event.stopPropagation()
        event.preventDefault()
        const rootRect = getClientRect()
        const [mx, my] = DomUtil.getMousePosIn(event, resizeBox)
        const dragOfsX = param.horz === 'left' ? -mx : W - mx
        const dragOfsY = param.vert === 'top' ? -my : W - my
        const rect = element.getBoundingClientRect()
        const prect = (element.parentNode as HTMLElement).getBoundingClientRect()
        const box = {
          left: rect.left - prect.left,
          top: rect.top - prect.top,
          right: rect.right - prect.left,
          bottom: rect.bottom - prect.top,
          center: 0,  // dummy
        }

        onEvent(WndEvent.RESIZE_BEGIN)

        const size = {width: box.right - box.left - 2, height: box.bottom - box.top - 2}
        DomUtil.setMouseDragListener({
          move: (event2: MouseEvent) => {
            let [x, y] = DomUtil.getMousePosIn(event2, element.parentNode as HTMLElement)
            x = Util.clamp(x, -dragOfsX, rootRect.width - dragOfsX)
            y = Util.clamp(y, -dragOfsY, rootRect.height - dragOfsY)
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
            DomUtil.setStyles(element, {
              width: `${Math.round(box.right - box.left - 2)}px`,
              height: `${Math.round(box.bottom - box.top - 2)}px`,
              left: `${Math.round(box.left)}px`,
              top: `${Math.round(box.top)}px`,
            })
            size.width = width
            size.height = height - Wnd.TITLEBAR_HEIGHT
            onEvent(WndEvent.RESIZE_MOVE, size)
          },
          up: (_event2: MouseEvent) => {
            onEvent(WndEvent.RESIZE_END)
          },
        })

        return true
      })
      element.appendChild(resizeBox)
    })
  }

  public static openSubmenu(
    menuItem: MenuItemInfo,
    pos: {left?: string; bottom?: string},
    parent: HTMLElement,
    option: {className?: string; onClose?: () => void},
  ): () => void {
    const subItemHolder = document.createElement('div')
    if (option.className != null)
      subItemHolder.className = option.className
    subItemHolder.style.zIndex = String(Z_MENU_SUBITEM)
    menuItem.submenu.forEach(submenuItem => {
      const submenuRow = document.createElement('div')
      submenuRow.className = 'submenu-row clearfix'
      const subItemElem = document.createElement('div')
      if (submenuItem.label !== '----') {
        let checked = submenuItem.checked
        if (typeof submenuItem.checked === 'function')
          checked = submenuItem.checked()
        if (checked) {
          const checkedElem = document.createElement('div')
          checkedElem.className = 'submenu-check'
          submenuRow.appendChild(checkedElem)
        }

        subItemElem.innerText = submenuItem.label
        let disabled = submenuItem.disabled
        if (typeof submenuItem.disabled === 'function')
          disabled = submenuItem.disabled()
        if (disabled) {
          subItemElem.className = 'menu-item disabled'
          submenuRow.addEventListener('click', event => {
            event.stopPropagation()
          })
        } else {
          subItemElem.className = 'menu-item'
          submenuRow.addEventListener('click', _event => {
            if (submenuItem.click)
              submenuItem.click()
          })
        }
      } else {
        const hr = document.createElement('hr')
        hr.className = 'submenu-splitter'
        submenuRow.style.padding = '4px 0'
        submenuRow.addEventListener('click', event => {
          event.stopPropagation()
        })
        submenuRow.appendChild(hr)
      }
      submenuRow.appendChild(subItemElem)
      subItemHolder.appendChild(submenuRow)
    })
    parent.appendChild(subItemHolder)

    DomUtil.setStyles(subItemHolder, pos)

    const close = () => {
      if (subItemHolder.parentNode != null)
        subItemHolder.parentNode.removeChild(subItemHolder)
      document.removeEventListener('click', onClickOther)
    }

    // To handle earlier than menu open, pass useCapture=true
    const onClickOther = (_event: MouseEvent) => {
      close()
      if (option.onClose != null)
        option.onClose()
    }
    document.addEventListener('click', onClickOther /*, true*/)

    return close
  }
}
