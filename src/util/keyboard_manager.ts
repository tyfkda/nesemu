export class KeyboardManager {
  private pressingKeys: {[key: string]: boolean} = {}
  private lastPressing: string | null = null

  public onKeyDown(event: KeyboardEvent): void {
    this.pressingKeys[event.code] = true
    this.lastPressing = event.code
  }

  public onKeyUp(event: KeyboardEvent): void {
    this.pressingKeys[event.code] = false
    if (this.lastPressing === event.code)
      this.lastPressing = null
  }

  public clear(): void {
    Object.keys(this.pressingKeys).forEach(key => (this.pressingKeys[key] = false))
  }

  public getKeyPressing(key: string): boolean {
    return this.pressingKeys[key] === true
  }

  public getLastPressing(): string | null {
    return this.lastPressing
  }
}
