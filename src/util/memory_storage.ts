export class MemoryStorage extends Storage {
  private storage: {[key: string]: string} = {}

  constructor() {
    super()
  }

  public setItem(key: string, value: any): void {
    this.storage[key] = String(value)
  }

  public getItem(key: string): string | null {
    const value = this.storage[key]
    if (typeof value === 'undefined')
      return null
    return value
  }

  public removeItem(key: string): void {
    delete this.storage[key]
  }

  public get length(): number {
    return Object.keys(this.storage).length
  }

  public key(i: number): string {
    const keys = Object.keys(this.storage)
    return keys[i]
  }
}
