const kHexTbl = '0123456789abcdef'

export class Util {
  public static hex(x, order) {
    order = order || 2
    const s = new Array(order)
    for (let i = 0; i < order; ++i) {
      s[order - i - 1] = kHexTbl[x & 0x0f]
      x >>= 4
    }
    return s.join('')
  }
}
