const kHexTbl = '0123456789abcdef'

if (!('fill' in Uint8ClampedArray.prototype)) {
  // Safari doesn't support fill method for typed array.
  Uint8ClampedArray.prototype.fill = function(value: number, start: number = 0,
                                              end: number = this.length): Uint8ClampedArray {
    for (let i = start; i < end; ++i)
      this[i] = value
    return this
  }
}

export class Util {
  public static hex(x, order) {
    const s = new Array(order)
    for (let i = 0; i < order; ++i) {
      s[order - i - 1] = kHexTbl[x & 0x0f]
      x >>= 4
    }
    return s.join('')
  }
}
