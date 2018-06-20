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
function getKey(key: any): string {
  return `${keyPrefix}${key}`
}

export default class StorageUtil {
  // Set key prefix.
  public static setKeyPrefix(prefix: string): void {
    keyPrefix = prefix
  }

  // Get string value.
  public static get(key: any, defaultValue: string): string {
    const k = getKey(key)
    return storage.getItem(k) || defaultValue
  }

  // Get int value.
  public static getInt(key: any, defaultValue: number): number {
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
  public static getFloat(key: any, defaultValue: number): number {
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
  public static getBool(key: any, defaultValue: boolean): boolean {
    const k = getKey(key)
    const value = storage.getItem(k)
    if (value === 'true')
      return true
    if (value === 'false')
      return false
    return defaultValue
  }

  // Get object value.
  public static getObject(key: any, defaultValue: any): any {
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
  public static put(key: any, value: any): boolean {
    const k = getKey(key)
    storage.setItem(k, value)
    return true
  }

  // Put object value.
  public static putObject(key: any, object: any): boolean {
    const k = getKey(key)
    storage.setItem(k, JSON.stringify(object))
    return true
  }
}
