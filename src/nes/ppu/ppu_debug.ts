import {Ppu} from './ppu'
import {getNameTable, getBgPatternTableAddress, getBgPat,
        SPRITE_PATTERN_TABLE_ADDRESS} from './ppu'
import {PpuReg} from './types'
import {Const} from '../const'
import {kPaletColors} from './const'

// No clipping, debug purpose.
function render8x8Chip(
  ppu: Ppu, pixels: Uint8ClampedArray, startOffset: number,
  pattern: Uint16Array, paletHigh: number,
  clearR: number, clearG: number, clearB: number, lineWidth: number)
{
  const W = 8
  const palet = ppu.getPaletTable()
  for (let py = 0; py < W; ++py) {
    const pat = pattern[py]
    for (let px = 0; px < W; ++px) {
      const pal = (pat >> ((W - 1) * 2 - (px << 1))) & 3
      let r = clearR, g = clearG, b = clearB
      if (pal !== 0) {
        const col = palet[paletHigh | pal] & 0x3f
        const c = col * 3
        r = kPaletColors[c]
        g = kPaletColors[c + 1]
        b = kPaletColors[c + 2]
      }

      const index = (py * lineWidth + px + startOffset) * 4
      pixels[index + 0] = r
      pixels[index + 1] = g
      pixels[index + 2] = b
    }
  }
}

export class PpuDebug {
  public static renderNameTable1(ppu: Ppu, pixels: Uint8ClampedArray, lineWidth: number,
                                 startX: number, startY: number, page: number): void
  {
    const regs = ppu.getRegs()
    const vram = ppu.getVram()
    const palet = ppu.getPaletTable()
    const chrData = ppu.getChrData()
    const hstatusMgr = ppu.getHStatusMgr()
    const mirrorModeBit = hstatusMgr.current.mirrorModeBit
    const chrBankOffset = hstatusMgr.current.chrBankOffset

    const nameTableOffset = page << 10

    const W = 8
    const chrStart = getBgPatternTableAddress(regs[PpuReg.CTRL])

    const clearColor = palet[0] & 0x3f  // Universal background color
    const clearR = kPaletColors[clearColor * 3 + 0]
    const clearG = kPaletColors[clearColor * 3 + 1]
    const clearB = kPaletColors[clearColor * 3 + 2]
    const pattern = new Uint16Array(W)

    for (let by = 0; by < Const.HEIGHT / W; ++by) {
      const ay = by % 30
      for (let bx = 0; bx < Const.WIDTH / W; ++bx) {
        const ax = bx & 31

        const nameTable = getNameTable(0, bx, by, mirrorModeBit) + nameTableOffset
        const name = vram[nameTable + ax + (ay << 5)]
        const chridx = name * 16 + chrStart
        const palShift = (ax & 2) + ((ay & 2) << 1)
        const atrBlk = (ax >> 2) + ((ay << 1) & 0x0f8)
        const attributeTable = nameTable + 0x3c0
        const paletHigh = ((vram[attributeTable + atrBlk] >> palShift) & 3) << 2

        for (let py = 0; py < W; ++py)
          pattern[py] = getBgPat(chrData, chridx, py, chrBankOffset)
        render8x8Chip(ppu, pixels, (by * W + startY) * lineWidth + bx * W + startX,
                      pattern, paletHigh, clearR, clearG, clearB, lineWidth)
      }
    }
  }

  public static renderPatternTable(ppu: Ppu, pixels: Uint8ClampedArray, lineWidth: number,
                                   colorGroups: Uint8Array): void
  {
    const W = 8
    const regs = ppu.getRegs()
    const palet = ppu.getPaletTable()
    const chrData = ppu.getChrData()
    const hstatusMgr = ppu.getHStatusMgr()
    const chrBankOffset = hstatusMgr.current.chrBankOffset

    const invert = (regs[PpuReg.CTRL] & SPRITE_PATTERN_TABLE_ADDRESS) === 0 ? 1 : 0
    const pattern = new Uint16Array(W)

    for (let i = 0; i < 2; ++i) {
      const b = i ^ invert
      const paletHigh = ((colorGroups[b] << 2) | (b << 4)) | 0
      const col0 = palet[paletHigh] & 0x3f
      const clearR = kPaletColors[col0 * 3 + 0]
      const clearG = kPaletColors[col0 * 3 + 1]
      const clearB = kPaletColors[col0 * 3 + 2]
      const startX = i * (W * 16)
      for (let by = 0; by < 16; ++by) {
        for (let bx = 0; bx < 16; ++bx) {
          const chridx = (bx + by * 16 + i * 256) * 16
          for (let py = 0; py < W; ++py)
            pattern[py] = getBgPat(chrData, chridx, py, chrBankOffset)
          render8x8Chip(ppu, pixels, (by * W) * lineWidth + bx * W + startX,
                        pattern, paletHigh, clearR, clearG, clearB, lineWidth)
        }
      }
    }
  }
}
