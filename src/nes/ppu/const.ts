export const kPaletColors = Uint32Array.from([
  0x7c7c7c, 0x0000fc, 0x0000bc, 0x4428bc, 0x940084, 0xa80020, 0xa81000, 0x881400,
  0x503000, 0x007800, 0x006800, 0x005800, 0x004058, 0x000000, 0x000000, 0x000000,

  0xbcbcbc, 0x0078f8, 0x0058f8, 0x6844fc, 0xd800cc, 0xe40058, 0xf83800, 0xe45c10,
  0xac7c00, 0x00b800, 0x00a800, 0x00a844, 0x008888, 0x000000, 0x000000, 0x000000,

  0xf8f8f8, 0x3cbcfc, 0x6888fc, 0x9878f8, 0xf878f8, 0xf85898, 0xf87858, 0xfca044,
  0xf8b800, 0xb8f818, 0x58d854, 0x58f898, 0x00e8d8, 0x787878, 0x000000, 0x000000,

  0xfcfcfc, 0xa4e4fc, 0xb8b8f8, 0xd8b8f8, 0xf8b8f8, 0xf8a4c0, 0xf0d0b0, 0xfce0a8,
  0xf8d878, 0xd8f878, 0xb8f8b8, 0xb8f8d8, 0x00fcfc, 0xf8d8f8, 0x000000, 0x000000,
])

// Insert 0 between each bits: abcdefgh -> 0a0b0c0d0e0f0g0h
export const kStaggered: Uint16Array = (() => {
  const NBIT = 8
  const N = 1 << NBIT
  const array = new Uint16Array(N)
  for (let i = 0; i < N; ++i) {
    let d = 0
    for (let j = 0; j < NBIT; ++j) {
      d <<= 2
      if ((i & (1 << (NBIT - 1 - j))) !== 0)
        d |= 1
    }
    array[i] = d
  }
  return array
})()

// Flip 8 bits horizontally: abcdefgh -> hgfedcba
export const kFlipXBits: Uint8Array = (() => {
  const NBIT = 8
  const N = 1 << NBIT
  const array = new Uint8Array(N)
  for (let i = 0; i < N; ++i) {
    let d = 0
    for (let j = 0; j < NBIT; ++j) {
      d <<= 1
      if ((i & (1 << j)) !== 0)
        d |= 1
    }
    array[i] = d
  }
  return array
})()
