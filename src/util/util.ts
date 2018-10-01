export default class Util {
  public static hex(x: number, order: number = 2): string {
    const s = x.toString(16)
    const dif = s.length - order
    if (dif > 0)
      return s.substring(dif)
    if (dif === 0)
      return s
    const zeros = '0000000'
    return zeros.substring(zeros.length + dif) + s
  }

  public static clamp(x: number, min: number, max: number): number {
    return x < min ? min : x > max ? max : x
  }

  public static getExt(fileName: string): string {
    const index = fileName.lastIndexOf('.')
    if (index >= 0)
      return fileName.slice(index + 1)
    return ''
  }

  public static convertUint8ArrayToBase64String(src: Uint8Array): string {
    const s = Array.from(src).map(x => String.fromCharCode(x)).join('')
    // return new Buffer(s).toString('base64')  // node.js
    return btoa(s)
  }

  public static convertBase64StringToUint8Array(src: string): Uint8Array {
    // const decoded = new Buffer(s, 'base64').toString('ascii')  // node.js
    const decoded = atob(src)
    const array = new Array(decoded.length)
    for (let i = 0; i < decoded.length; ++i)
      array[i] = decoded.charCodeAt(i)
    return new Uint8Array(array)
  }
}
