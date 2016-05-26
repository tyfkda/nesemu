// PPU: Picutre Processing Unit

import {Const, kColors, kStaggered, kFlipBits} from './const.ts'
import {Util} from './util.ts'

const REGISTER_COUNT = 8
const VRAM_SIZE = 0x4000
const OAM_SIZE = 0x0100

// PPUCTRL ($2000)
const PPUCTRL = 0x00
const VINT_ENABLE = 0x80  // V: 1=Trigger NMI when VBLANK start
const SPRITE_SIZE = 0x20
const BG_PATTERN_TABLE_ADDRESS = 0x10
const SPRITE_PATTERN_TABLE_ADDRESS = 0x08
const INCREMENT_MODE = 0x04  // I: 1=+32, 0=+1
const BASE_NAMETABLE_ADDRESS = 0x03

// PPUMASK ($2001)
const PPUMASK = 0x01
const SHOW_BG = 0x08
const SHOW_SPRITE = 0x10

// PPUSTATUS ($2002)
const PPUSTATUS = 0x02
const VBLANK = 0x80
const SPRITE0HIT = 0x40

// OAMADDR ($2003)
const OAMADDR = 0x03

// OAMDATA ($2004)
//const OAMDATA = 0x04

const PPUSCROLL = 0x05  // $2005
const PPUADDR = 0x06  // $2006
const PPUDATA = 0x07  // $2007

function getNameTable(baseNameTable: number, bx: number, by: number, mirrorMode: number): number {
  const adr = 0x2000 + baseNameTable
  if (mirrorMode === 0) {
    return adr ^ (((by / 30) & 1) << 11)
  } else {
    return adr ^ ((bx & 32) << 5)
  }
}

function getPpuAddr(addr: number): number {
  // "Addresses $3F10/$3F14/$3F18/$3F1C are mirrors of $3F00/$3F04/$3F08/$3F0C."
  // http://wiki.nesdev.com/w/index.php/PPU_palettes#Memory_Map
  if ((addr & 0xfff3) === 0x3f10)
    addr &= 0xffef
  return addr
}

function incPpuAddr(ppuAddr: number, ppuCtrl: number): number {
  const add = ((ppuCtrl & INCREMENT_MODE) !== 0) ? 32 : 1
  return (ppuAddr + add) & (VRAM_SIZE - 1)
}

export class Ppu {
  public regs: Uint8Array
  public chrData: Uint8Array
  public vram: Uint8Array
  public oam: Uint8Array  // Object Attribute Memory
  public scrollX: number
  public scrollY: number
  public mirrorMode: number
  private latch: number
  private ppuAddr: number
  private scrollXSave: number
  private scrollYSave: number
  private ppuCtrlSave: number
  private ppuMaskSave: number
  private bufferedValue: number

  constructor() {
    this.regs = new Uint8Array(REGISTER_COUNT)
    this.vram = new Uint8Array(VRAM_SIZE)
    this.oam = new Uint8Array(OAM_SIZE)
    this.mirrorMode = 0
  }

  public reset(): void {
    this.regs.fill(0)
    this.vram.fill(0)
    this.oam.fill(0)
    this.scrollX = this.scrollY = this.scrollXSave = this.scrollYSave = 0
    this.ppuAddr = 0
    this.latch = 0
    this.bufferedValue = 0
  }

  public setChrData(chrData: Uint8Array): void {
    this.chrData = chrData
  }

  public setMirrorMode(mode: number): void {
    this.mirrorMode = mode
  }

  public read(reg: number): number {
    let result = this.regs[reg]
    switch (reg) {
    case PPUSTATUS:
      this.regs[PPUSTATUS] &= ~VBLANK
      this.latch = 0
      break
    case PPUDATA:
      result = this.bufferedValue
      this.bufferedValue = this.vram[getPpuAddr(this.ppuAddr)]
      this.ppuAddr = incPpuAddr(this.ppuAddr, this.regs[PPUCTRL])
      break
    default:
      break
    }
    return result
  }

  public write(reg: number, value: number): void {
    this.regs[reg] = value

    switch (reg) {
    case PPUSCROLL:
      if (this.latch === 0)
        this.scrollX = value
      else
        this.scrollY = value
      this.latch = 1 - this.latch
      break
    case PPUADDR:
      if (this.latch === 0)
        this.ppuAddr = value
      else
        this.ppuAddr = ((this.ppuAddr << 8) | value) & (VRAM_SIZE - 1)
      this.latch = 1 - this.latch
      break
    case PPUDATA:
      this.vram[getPpuAddr(this.ppuAddr)] = value
      this.ppuAddr = incPpuAddr(this.ppuAddr, this.regs[PPUCTRL])
      break
    default:
      break
    }
  }

  public copyWithDma(array: Uint8Array, start: number): void {
    const dst = this.oam
    let j = this.regs[OAMADDR]
    for (let i = 0; i < 256; ++i) {
      dst[j] = array[start + i]
      j = (j + 1) & 255
    }
  }

  public setVBlank(): void {
    this.regs[PPUSTATUS] = (this.regs[PPUSTATUS] | VBLANK) & ~SPRITE0HIT
    this.scrollXSave = this.scrollX
    this.scrollYSave = this.scrollY
    this.ppuCtrlSave = this.regs[PPUCTRL]
    this.ppuMaskSave = this.regs[PPUMASK]
  }
  public clearVBlank(): void {
    this.regs[PPUSTATUS] &= ~VBLANK
  }

  public setSprite0Hit(): void {
    this.regs[PPUSTATUS] |= SPRITE0HIT  // TODO: Implmenet correctly
  }

  public interruptEnable(): boolean {
    return (this.regs[PPUCTRL] & VINT_ENABLE) !== 0
  }

  public getBgPatternTableAddress(): number {
    return ((this.ppuCtrlSave & BG_PATTERN_TABLE_ADDRESS) << 8)
  }

  public getSpritePatternTableAddress(): number {
    if ((this.ppuCtrlSave & SPRITE_SIZE) === 0)
      return ((this.ppuCtrlSave & SPRITE_PATTERN_TABLE_ADDRESS) << 9)
    return 0
  }

  public isSprite8x16(): boolean {
    return (this.ppuCtrlSave & SPRITE_SIZE) !== 0
  }

  public renderBg(imageData: ImageData): void {
    if ((this.ppuMaskSave & SHOW_BG) === 0)
      return this.clearBg(imageData)
    this.doRenderBg(imageData, this.scrollXSave, this.scrollYSave, 0, 0,
                    (this.ppuCtrlSave & BASE_NAMETABLE_ADDRESS) << 10)
  }

  public doRenderBg(imageData: ImageData, scrollX: number, scrollY: number,
                    startX: number, startY: number, baseNameTable: number): void
  {
    const W = 8
    const LINE_WIDTH = imageData.width
    const chrRom = this.chrData
    const chrStart = this.getBgPatternTableAddress()
    const vram = this.vram
    const paletTable = 0x3f00
    const pixels = imageData.data

    const clearColor = vram[paletTable] & 0x3f  // Universal background color
    const clearR = kColors[clearColor * 3 + 0]
    const clearG = kColors[clearColor * 3 + 1]
    const clearB = kColors[clearColor * 3 + 2]

    if (scrollY >= 240)
      scrollY = (scrollY - 256)

    for (let bby = 0; bby < Const.HEIGHT / W + 1; ++bby) {
      const by = ((bby + (scrollY >> 3)) + 60) % 60
      const ay = by % 30
      for (let bbx = 0; bbx < Const.WIDTH / W + 1; ++bbx) {
        const bx = (bbx + (scrollX >> 3)) & 63
        const ax = bx & 31

        const nameTable = getNameTable(baseNameTable, bx, by, this.mirrorMode)
        const name = vram[nameTable + ax + (ay << 5)]
        const chridx = name * 16 + chrStart
        const palShift = (ax & 2) + ((ay & 2) << 1)
        const atrBlk = (ax >> 2) + ((ay << 1) & 0x0f8)
        const attributeTable = nameTable + 0x3c0
        const paletHigh = ((vram[attributeTable + atrBlk] >> palShift) & 3) << 2

        for (let py = 0; py < W; ++py) {
          const yy = bby * W + py - (scrollY & 7)
          if (yy < 0)
            continue
          if (yy >= Const.HEIGHT)
            break
          const idx = chridx + py
          const pat = (kStaggered[chrRom[idx + 8]] << 1) | kStaggered[chrRom[idx]]
          for (let px = 0; px < W; ++px) {
            const xx = bbx * W + px - (scrollX & 7)
            if (xx < 0)
              continue
            if (xx >= Const.WIDTH)
              break
            const pal = (pat >> ((W - 1 - px) * 2)) & 3
            let r = clearR, g = clearG, b = clearB
            if (pal !== 0) {
              const palet = paletHigh + pal
              const col = vram[paletTable + palet] & 0x3f
              const c = col * 3
              r = kColors[c]
              g = kColors[c + 1]
              b = kColors[c + 2]
            }

            const index = ((yy + startY) * LINE_WIDTH + (xx + startX)) * 4
            pixels[index + 0] = r
            pixels[index + 1] = g
            pixels[index + 2] = b
          }
        }
      }
    }
  }

  public clearBg(imageData: ImageData): void {
    const LINE_BYTES = imageData.width * 4
    const pixels = imageData.data
    for (let i = 0; i < imageData.height; ++i) {
      let index = i * LINE_BYTES
      for (let j = 0; j < imageData.width; ++j) {
        pixels[index++] = 0
        pixels[index++] = 0
        pixels[index++] = 0
        pixels[index++] = 255
      }
    }
  }

  public renderSprite(imageData: ImageData): void {
    if ((this.ppuMaskSave & SHOW_SPRITE) === 0)
      return

    const W = 8
    const LINE_WIDTH = imageData.width
    const PALET = 0x03
    const FLIP_HORZ = 0x40
    const FLIP_VERT = 0x80

    const oam = this.oam
    const vram = this.vram
    const chrRom = this.chrData
    const chrStart = this.getSpritePatternTableAddress()
    const paletTable = 0x3f10
    const pixels = imageData.data
    const isSprite8x16 = this.isSprite8x16()
    const h = isSprite8x16 ? 16 : 8

    for (let i = 64; --i >= 0; ) {
      const y = oam[i * 4] + 1
      const index = oam[i * 4 + 1]
      const attr = oam[i * 4 + 2]
      const x = oam[i * 4 + 3]

      const chridx = (isSprite8x16
                      ? (index & 0xfe) * 16 + ((index & 1) << 12)
                      : index * 16 + chrStart)
      const paletHigh = (attr & PALET) << 2

      for (let py = 0; py < h; ++py) {
        if (y + py >= Const.HEIGHT)
          break

        const ppy = (attr & FLIP_VERT) !== 0 ? (h - 1) - py : py
        const idx = chridx + (ppy & 7) + ((ppy & 8) * 2)
        let patHi = chrRom[idx + W]
        let patLo = chrRom[idx]
        if ((attr & FLIP_HORZ) !== 0) {
          patHi = kFlipBits[patHi]
          patLo = kFlipBits[patLo]
        }
        const pat = (kStaggered[patHi] << 1) | kStaggered[patLo]
        for (let px = 0; px < W; ++px) {
          if (x + px >= Const.WIDTH)
            break

          const pal = (pat >> ((W - 1 - px) * 2)) & 3
          if (pal === 0)
            continue
          const palet = paletHigh + pal
          const col = vram[paletTable + palet] & 0x3f
          const c = col * 3
          const index = ((y + py) * LINE_WIDTH + (x + px)) * 4
          pixels[index + 0] = kColors[c]
          pixels[index + 1] = kColors[c + 1]
          pixels[index + 2] = kColors[c + 2]
        }
      }
    }
  }

  public dumpVram(start: number, count: number): void {
    const mem = []
    for (let i = 0; i < count; ++i) {
      mem.push(this.vram[getPpuAddr(start + i)])
    }

    for (let i = 0; i < count; i += 16) {
      const line = mem.splice(0, 16).map(x => Util.hex(x, 2)).join(' ')
      console.log(`${Util.hex(start + i, 4)}: ${line}`)
    }
  }
}
