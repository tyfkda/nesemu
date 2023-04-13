export const ScalerType = {
  NEAREST: 'nearest',
  SCANLINE: 'scanline',
  EPX: 'epx',
} as const

export type ScalerType = typeof ScalerType[keyof typeof ScalerType]
