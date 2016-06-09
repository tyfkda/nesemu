const kHexTbl = '0123456789abcdef'

if (!('fill' in Array.prototype)) {
  // IE doesn't support fill method for Array.
  /* tslint:disable:no-invalid-this */
  Array.prototype.fill = function(value: number, start: number = 0,
                                  end: number = this.length): Array {
    for (let i = start; i < end; ++i)
      this[i] = value
    return this
  }
}

if (!('fill' in Uint8Array.prototype)) {
  // Safari doesn't support fill method for typed array.
  /* tslint:disable:no-invalid-this */
  Uint8Array.prototype.fill = function(value: number, start: number = 0,
                                       end: number = this.length): Uint8Array {
    for (let i = start; i < end; ++i)
      this[i] = value
    return this
  }
}

if (!Uint8Array.prototype.slice) {
  Uint8Array.prototype.slice = function(start, end) {
    if (end == undefined)
      end = this.length
    const sliced = new Uint8Array(end - start)
    for (let i = 0; i < sliced.length; ++i)
      sliced[i] = this[i + start]
    return sliced
  }
}

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
