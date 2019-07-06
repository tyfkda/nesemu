// Local storage
import MemoryStorage from './memory_storage'

let storage: Storage = window.localStorage
let keyPrefix = ''

// Set up.
if (storage == null) {
  try {
    if ('localStorage' in window && window.localStorage != null) {
      storage = window.localStorage
    }
  } catch (e) {
    // If we cannot use local storage, then use memory storage.
  }
  if (storage == null)
    storage = new MemoryStorage()
}

// Get key.
function getKey(key: string): string {
  return `${keyPrefix}${key}`
}

export default class StorageUtil {
  // Set key prefix.
  public static setKeyPrefix(prefix: string): void {
    keyPrefix = prefix
  }

  public static hasKey(key: string): boolean {
    const k = getKey(key)
    return storage.getItem(k) != null
  }

  // Get string value.
  public static get(key: string, defaultValue: string): string {
    const k = getKey(key)
    return storage.getItem(k) || defaultValue
  }

  // Get int value.
  public static getInt(key: string, defaultValue: number): number {
    const k = getKey(key)
    const item = storage.getItem(k)
    if (item == null)
      return defaultValue
    const value = parseInt(item, 10)
    if (isNaN(value))
      return defaultValue
    return value
  }

  // Get float value.
  public static getFloat(key: string, defaultValue: number): number {
    const k = getKey(key)
    const item = storage.getItem(k)
    if (item == null)
      return defaultValue
    const value = parseFloat(item)
    if (isNaN(value))
      return defaultValue
    return value
  }

  // Get bool value.
  public static getBool(key: string, defaultValue: boolean): boolean {
    const k = getKey(key)
    const value = storage.getItem(k)
    if (value === 'true')
      return true
    if (value === 'false')
      return false
    return defaultValue
  }

  // Get object value.
  public static getObject(key: string, defaultValue: any): any {
    const k = getKey(key)
    const value = storage.getItem(k)
    try {
      if (value != null)
        return JSON.parse(value)
    } catch (e) {
      console.error(e)
    }
    return defaultValue
  }

  // Put string value.
  public static put(key: string, value: any): boolean {
    const k = getKey(key)
    storage.setItem(k, value)
    return true
  }

  // Put object value.
  public static putObject(key: string, obj: object): boolean {
    const k = getKey(key)
    storage.setItem(k, JSON.stringify(obj))
    return true
  }
}
