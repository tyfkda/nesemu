import DomUtil from '../util/dom_util'
import KeyboardManager from '../util/keyboard_manager'
import Wnd from './wnd'
import {WndEvent} from './types'

import fscreen from 'fscreen'

const BASE_PRIORITY = 100

function setWindowZIndex(wnd: Wnd, i: number, n: number): void {
  wnd.getRootNode().style.zIndex = String(BASE_PRIORITY + (n - 1 - i))
}

export default class WindowManager {
  private windows: Wnd[] = []
  private keyboardManager = new KeyboardManager()

  private onKeyDown: (event: KeyboardEvent) => void
  private onKeyUp: (event: KeyboardEvent) => void
  private blurred = false
  private rafId = 0  // requestAnimationFrame

  public constructor(private root: HTMLElement) {
    this.onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey) {  // Ctrl+W: Quit
        if (event.code === 'KeyW') {
          if (this.windows.length > 0)
            this.windows[0].close()
          return
        }
      }

      if (event.ctrlKey || event.altKey || event.metaKey)
        return

      event.preventDefault()
      this.keyboardManager.onKeyDown(event)
    }
    this.onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault()
      this.keyboardManager.onKeyUp(event)
    }
    this.root.addEventListener('keydown', this.onKeyDown)
    this.root.addEventListener('keyup', this.onKeyUp)

    this.setUpBlur()
    this.setFocus()
  }

  public setFocus(): void {
    this.root.focus()
  }

  public isBlur(): boolean {
    return this.blurred
  }

  public getKeyboardManager(): KeyboardManager {
    return this.keyboardManager
  }

  public add(wnd: Wnd): void {
    if (this.windows.length > 0)
      this.windows[0].onEvent(WndEvent.FOCUS, false)
    this.windows.unshift(wnd)
    this.root.appendChild(wnd.getRootNode())
    this.updateWindowPriorities()

    if (this.windows.length === 1)
      this.startLoopAnimation()
  }

  public remove(wnd: Wnd): void {
    this.removeWnd(wnd)

    const elem = wnd.getRootNode()
    if (elem != null && elem.parentNode != null)
      elem.parentNode.removeChild(elem)

    if (this.windows.length <= 0)
      this.cancelLoopAnimation()
  }

  public async showSnackbar(message: string, option: any = {}): Promise<void> {
    const wait = option.wait || 3000
    const type = option.type || 'danger'

    const div = document.createElement('div')
    div.className = 'snackbar-container'
    div.style.zIndex = '10000'
    const box = document.createElement('div')
    box.className = `snackbar-box ${type}`
    div.appendChild(box)
    const text = document.createTextNode(message)
    box.appendChild(text)
    this.root.appendChild(div)

    await DomUtil.timeout(20)  // Dirty hack.
    div.style.top = '8px'
    await DomUtil.timeout(wait)
    div.style.top = '-32px'
    await DomUtil.timeout(500)
    this.root.removeChild(div)
  }

  public moveToTop(wnd: Wnd): void {
    const n = this.windows.length
    if (n > 0 && this.windows[0] === wnd)  // Already on the top
      return

    this.windows[0].onEvent(WndEvent.FOCUS, false)
    let prev = wnd
    for (let i = 0; i < n; ++i) {
      const tmp = this.windows[i]
      this.windows[i] = prev
      if (tmp === wnd)
        break
      prev = tmp
    }

    this.updateWindowPriorities()
    wnd.onEvent(WndEvent.FOCUS, true)
  }

  public isTop(wnd: Wnd): boolean {
    return this.windows.length > 0 && this.windows[0] === wnd
  }

  public moveToCenter(wnd: Wnd): void {
    const rootRect = this.root.getBoundingClientRect()
    const wndSize = wnd.getWindowSize()
    wnd.setPos((rootRect.width - wndSize.width) / 2, (rootRect.height - wndSize.height) / 2)
  }

  public setFullscreen(element: HTMLElement, callback: (isFullscreen: boolean) => void): boolean {
    if (!fscreen.fullscreenEnabled)
      return false

    fscreen.requestFullscreen(element)
    const exitHandler = () => {
      const isFullscreen = fscreen.fullscreenElement != null
      if (isFullscreen) {
        element.setAttribute('tabindex', '1')
        element.style.cursor = 'none'
        element.addEventListener('keydown', this.onKeyDown)
        element.addEventListener('keyup', this.onKeyUp)
      } else {
        element.removeAttribute('tabindex')
        element.style.cursor = ''
        element.removeEventListener('keydown', this.onKeyDown)
        element.removeEventListener('keyup', this.onKeyUp)
      }

      if (callback)
        callback(isFullscreen)
      if (isFullscreen) {
        element.focus()
      } else {  // End
        fscreen.removeEventListener('fullscreenchange', exitHandler, false)
        this.setFocus()
      }
    }
    fscreen.addEventListener('fullscreenchange', exitHandler, false)

    return true
  }

  public getRootClientRect(): DOMRect {
    return this.root.getBoundingClientRect()
  }

  private removeWnd(wnd: Wnd): void {
    const index = this.windows.indexOf(wnd)
    if (index < 0)
      return
    this.windows.splice(index, 1)
    if (index === 0 && this.windows.length > 0)
      this.windows[0].onEvent(WndEvent.FOCUS, true)
    this.updateWindowPriorities()
  }

  private updateWindowPriorities(): void {
    const n = this.windows.length
    for (let i = 0; i < n; ++i) {
      const wnd = this.windows[i]
      wnd.setTop(i === 0)
      setWindowZIndex(wnd, i, n)
    }
  }

  private setUpBlur(): void {
    window.addEventListener('focus', () => {
      this.blurred = false
    })
    window.addEventListener('blur', () => {
      this.blurred = true
      this.keyboardManager.clear()
    })
  }

  private startLoopAnimation(): void {
    if (this.rafId !== 0)
      return

    let lastTime = window.performance.now()
    const loopFn = () => {
      const curTime = window.performance.now()
      const elapsedTime = curTime - lastTime
      lastTime = curTime

      // Deriver RAF to all windows.
      for (let i = 0; i < this.windows.length; ++i) {
        const wnd = this.windows[i]
        wnd.onEvent(WndEvent.UPDATE_FRAME, elapsedTime)
      }
      this.rafId = requestAnimationFrame(loopFn)
    }
    this.rafId = requestAnimationFrame(loopFn)
  }

  private cancelLoopAnimation(): void {
    if (this.rafId === 0)
      return
    cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }
}
