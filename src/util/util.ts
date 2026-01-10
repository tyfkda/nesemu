declare function btoa(str: string): string
declare function atob(str: string): string

const _btoa = typeof btoa !== 'undefined' ? btoa : (function(str: string | Buffer): string {
  const buffer = (str instanceof Buffer) ? str : Buffer.from(str.toString(), 'binary')
  return buffer.toString('base64')
})

const _atob = typeof atob !== 'undefined' ? atob : (function(str: string): string {
  return Buffer.from(str, 'base64').toString('binary')
})

export class Util {
  public static hex(x: number, order = 2): string {
    let s = x.toString(16).padStart(order, '0')
    if (s.length > order)
      s = s.substring(s.length - order)
    return s
  }

  public static clamp(x: number, min: number, max: number): number {
    if (max < min)
      return min
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
    return _btoa(s)
  }

  public static convertBase64StringToUint8Array(src: string): Uint8Array {
    const decoded = _atob(src)
    const u8array = new Uint8Array(decoded.length)
    for (let i = 0; i < decoded.length; ++i)
      u8array[i] = decoded.charCodeAt(i)
    return u8array
  }

  public static makeDataUrl(data: Uint8Array, type?: string): string {
    let type2 = type || ''
    if (type2.match(/[ ()<>@,;:\\"/[\]?=\p{gc=Control}]/u)) {
      type2 = ''
    }

    return `data:${type2};base64,${Util.convertUint8ArrayToBase64String(data)}`
  }
}
