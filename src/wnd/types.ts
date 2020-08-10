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
  FOCUS,
  BLUR,
}

export interface SubmenuItemInfo {
  label: string
  click?: () => void
  checked?: boolean | (() => boolean)
  disabled?: boolean | (() => boolean)
}

export interface MenuItemInfo {
  label: string
  submenu: Array<SubmenuItemInfo>
}
