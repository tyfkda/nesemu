///<reference path="../decl/patch.d.ts" />

import Util from '../../src/util/util'

describe('util', () => {
  it('hex', () => {
    expect(Util.hex(0x0123, 4)).toBe('0123')
    expect(Util.hex(0xa5)).toBe('a5')
    expect(Util.hex(0x0123, 2)).toBe('23')
  })

  it('clamp', () => {
    expect(Util.clamp(1, 0, 10)).toBe(1)
    expect(Util.clamp(-1, 0, 10)).toBe(0)
    expect(Util.clamp(12, 0, 10)).toBe(10)
  })
})
