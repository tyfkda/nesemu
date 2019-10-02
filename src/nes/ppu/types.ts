export const enum MirrorMode {
  HORZ = 0,
  VERT = 1,
  SINGLE0 = 2,
  SINGLE1 = 3,
  REVERSE_HORZ = 4,
}

export const enum PpuReg {
  CTRL,    // $2000
  MASK,    // $2001
  STATUS,  // $2002
  OAMADDR, // $2003
  OAMDATA, // $2004
  SCROLL,  // $2005
  ADDR,    // $2006
  DATA,    // $2007
}

// PPUCTRL ($2000)
export const enum PpuCtrlBit {
  VINT_ENABLE = 0x80,  // V: 1=Trigger NMI when VBLANK start
  SPRITE_SIZE = 0x20,
  BG_PATTERN_TABLE_ADDRESS = 0x10,
  SPRITE_PATTERN_TABLE_ADDRESS = 0x08,
  INCREMENT_MODE = 0x04,  // I: 1=+32, 0=+1
  BASE_NAMETABLE_ADDRESS = 0x03,
}

// PPUMASK ($2001)
export const enum PpuMaskBit {
  SHOW_SPRITE = 0x10,
  SHOW_BG = 0x08,
  SHOW_SPRITE_LEFT_8PX = 0x04,
  SHOW_BG_LEFT_8PX = 0x02,
  GREYSCALE = 0x01,
}

// PPUSTATUS ($2002)
export const enum PpuStatusBit {
  VBLANK = 0x80,
  SPRITE0HIT = 0x40,
  SPRITE_OVERFLOW = 0x20,
}

// OAMADDR ($2003)

// PPUSCROLL ($2005)
// PPUADDR ($2006)
// PPUDATA ($2007)

// Sprite
export const enum OamElem {
  Y,
  INDEX,
  ATTR,
  X,
}

export const enum OamAttrBit {
  FLIP_HORZ = 0x40,
  FLIP_VERT = 0x80,
}
