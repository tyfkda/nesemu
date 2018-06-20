export default class MemoryStorage extends Storage {
  private storage = {}

  constructor() {
    super()
  }

  public setItem(key, value) {
    this.storage[key] = String(value)
  }

  public getItem(key) {
    const value = this.storage[key]
    if (typeof value === 'undefined')
      return null
    return value
  }

  public removeItem(key) {
    delete this.storage[key]
  }

  public get length() {
    return Object.keys(this.storage).length
  }

  public key(i) {
    const keys = Object.keys(this.storage)
    return keys[i] || null
  }
}
