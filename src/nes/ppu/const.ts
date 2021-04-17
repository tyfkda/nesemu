export const kPaletColors = Uint32Array.from([
  0x6c6c6d, 0x121786, 0x0e009c, 0x3e008f, 0x710069, 0x810015, 0x7a0400, 0x5a1100,
  0x2f2e00, 0x004100, 0x004900, 0x003b17, 0x0c3659, 0x000000, 0x000000, 0x000000,
  0xb6b5b6, 0x0b5edb, 0x3331ea, 0x760de6, 0xa90bb6, 0xc20c59, 0xb72c00, 0xa24a06,
  0x716b00, 0x118600, 0x009400, 0x00843a, 0x00768a, 0x000000, 0x000000, 0x000000,
  0xfdfdfd, 0x4eb1fd, 0x758cfd, 0xc07efd, 0xeb72fd, 0xf76ebb, 0xf67960, 0xea9730,
  0xd5b822, 0x80cc0c, 0x51d843, 0x50e48b, 0x25d7d3, 0x626263, 0x000000, 0x000000,
  0xfdfdfd, 0xb5e2fd, 0xccd3fd, 0xdbc9fd, 0xfac6fd, 0xfdc5e3, 0xfdc5bb, 0xf9d8ab,
  0xf3e4a0, 0xdaf59f, 0xb4f1b7, 0xb4f7cc, 0xabf5ef, 0xbfbfc0, 0x000000, 0x000000,
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
