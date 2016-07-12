import {Util} from '../../src/nes/util.ts'

describe('util', () => {
  it('hex', () => {
    expect(Util.hex(0x0123, 4)).toBe('0123')
    expect(Util.hex(0xa5)).toBe('a5')
  })
})
