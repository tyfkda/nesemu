export default class KeyboardManager {
  private pressingKeys: {[key: string]: boolean} = {}
  private lastPressing: string | null = null

  public onKeyDown(event: KeyboardEvent) {
    this.pressingKeys[event.code] = true
    this.lastPressing = event.code
  }

  public onKeyUp(event: KeyboardEvent) {
    this.pressingKeys[event.code] = false
    if (this.lastPressing === event.code)
      this.lastPressing = null
  }

  public getKeyPressing(key: string): boolean {
    return this.pressingKeys[key]
  }

  public getLastPressing(): string | null {
    return this.lastPressing
  }
}
