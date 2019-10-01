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
