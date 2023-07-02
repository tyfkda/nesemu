export const Z_MENUBAR = 1000
export const Z_MENU_SUBITEM = Z_MENUBAR + 1

export const enum WndEvent {
  UPDATE_FRAME,  // RequestAnimationFrame
  CLOSE,
  DRAG_BEGIN,
  DRAG_MOVE,
  DRAG_END,
  OPEN_MENU,
  CLOSE_MENU,
  RESIZE_BEGIN,
  RESIZE_MOVE,
  RESIZE_END,
  FOCUS,  // param: true or false
  KEY_DOWN,
  KEY_UP,
}

export interface SubmenuItemInfo {
  label: string
  shortcut?: string
  click?: () => void
  checked?: boolean | (() => boolean)
  disabled?: boolean | (() => boolean)
}

export interface MenuItemInfo {
  label: string
  submenu: Array<SubmenuItemInfo>
}
