///<reference path="../decl/patch.d.ts" />

import {Util} from '../../src/nes/util'

describe('util', () => {
  it('hex', () => {
    expect(Util.hex(0x0123, 4)).toBe('0123')
    expect(Util.hex(0xa5)).toBe('a5')
    expect(Util.hex(0x0123, 2)).toBe('23')
  })
})
