if (!('fill' in Array.prototype)) {
  // IE doesn't support fill method for Array.
  /* tslint:disable:no-invalid-this */
  Array.prototype.fill = function(value: number, start: number = 0,
                                  end: number = this.length): Array<any> {
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
