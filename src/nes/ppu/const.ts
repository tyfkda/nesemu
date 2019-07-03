export const kColors = Uint8Array.from([
  124, 124, 124,
  0, 0, 252,
  0, 0, 188,
  68, 40, 188,
  148, 0, 132,
  168, 0, 32,
  168, 16, 0,
  136, 20, 0,
  80, 48, 0,
  0, 120, 0,
  0, 104, 0,
  0, 88, 0,
  0, 64, 88,
  0, 0, 0,
  0, 0, 0,
  0, 0, 0,
  188, 188, 188,
  0, 120, 248,
  0, 88, 248,
  104, 68, 252,
  216, 0, 204,
  228, 0, 88,
  248, 56, 0,
  228, 92, 16,
  172, 124, 0,
  0, 184, 0,
  0, 168, 0,
  0, 168, 68,
  0, 136, 136,
  0, 0, 0,
  0, 0, 0,
  0, 0, 0,
  248, 248, 248,
  60, 188, 252,
  104, 136, 252,
  152, 120, 248,
  248, 120, 248,
  248, 88, 152,
  248, 120, 88,
  252, 160, 68,
  248, 184, 0,
  184, 248, 24,
  88, 216, 84,
  88, 248, 152,
  0, 232, 216,
  120, 120, 120,
  0, 0, 0,
  0, 0, 0,
  252, 252, 252,
  164, 228, 252,
  184, 184, 248,
  216, 184, 248,
  248, 184, 248,
  248, 164, 192,
  240, 208, 176,
  252, 224, 168,
  248, 216, 120,
  216, 248, 120,
  184, 248, 184,
  184, 248, 216,
  0, 252, 252,
  248, 216, 248,
  0, 0, 0,
  0, 0, 0,
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
