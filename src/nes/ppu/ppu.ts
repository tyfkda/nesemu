// PPU: Picutre Processing Unit

// PPU scrolling
// https://wiki.nesdev.com/w/index.php/PPU_scrolling

import {Const} from '../const'
import {Address, Byte} from '../types'
import {kPaletColors, kStaggered, kFlipXBits} from './const'
import {HEventType, HEvents, HStatusMgr} from './hevent'
import {MirrorMode, PpuReg, PpuCtrlBit, PpuMaskBit, PpuStatusBit, OamElem,
        OamAttrBit} from './types'
import Util from '../../util/util'

const REGISTER_COUNT = 8
const VRAM_SIZE = 0x4000
const OAM_SIZE = 0x0100
const MAX_SPRITE_ON_SCANLINE = 8

// OAMDATA ($2004)
const MAX_SPRITE = 64

// Palette
const PALET_ADR = 0x3f00
const PALET_END_ADR = 0x3fff

const kMirrorModeBitTable = Uint8Array.from([0x50, 0x44, 0x00, 0x55, 0x05])

const kInitialPalette = Uint8Array.from([
  0x09, 0x01, 0x00, 0x01, 0x00, 0x02, 0x02, 0x0d, 0x08, 0x10, 0x08, 0x24, 0x00, 0x00, 0x04, 0x2c,
  0x09, 0x01, 0x34, 0x03, 0x00, 0x04, 0x00, 0x14, 0x08, 0x3a, 0x00, 0x02, 0x00, 0x20, 0x2c, 0x08,
])

const SPRITE_MASK = 0x80
const kSpritePriorityMask = Uint8Array.from([SPRITE_MASK, 0xff])

export function getNameTable(baseNameTable: Address, bx: number, by: number,
                             mirrorModeBit: Byte): Address
{
  const page = (((bx >> 5) & 1) + (((by / 30) & 1) << 1)) ^ baseNameTable  // 0~3
  const m = (mirrorModeBit << (10 - (page << 1))) & 0x0c00
  return (0x2000 + m) | 0
}

export function getBgPatternTableAddress(ppuCtrl: Byte): Address {
  return (ppuCtrl & PpuCtrlBit.BG_PATTERN_TABLE_ADDRESS) << 8
}

export function getBgPat(chrData: Readonly<Uint8Array>, chridx: number, py: number,
                         chrBankOffset: number[]): number
{
  const idx = chridx + py
  const bank = (idx >> 10) & 7
  const p = chrBankOffset[bank] + (idx & 0x03ff)
  return kStaggered[chrData[p]] | (kStaggered[chrData[p + 8]] << 1)
}

function getPpuAddr(adr: Address, mirrorModeBit: Byte): Address {
  adr &= 0x3fff
  if (0x3000 <= adr && adr < 0x3f00)
    adr -= 0x1000  // Map 0x3000~3eff to 0x2000~
  if (0x2000 <= adr && adr < 0x3000) {
    const page = (adr >> 10) & 3
    const m = (mirrorModeBit << (10 - (page << 1))) & 0x0c00
    return (adr & 0xf3ff) | m
  }

  if (PALET_ADR <= adr && adr <= PALET_END_ADR) {
    adr &= 0xff1f  // Repeat 0x3f00~0x3f1f --> 0x3fff
    // "Addresses $3F10/$3F14/$3F18/$3F1C are mirrors of $3F00/$3F04/$3F08/$3F0C."
    // http://wiki.nesdev.com/w/index.php/PPU_palettes#Memory_Map
    if ((adr & 0xfff3) === 0x3f10)
      adr &= 0xffef
  }
  return adr
}

function incPpuAddr(ppuAddr: Address, ppuCtrl: Byte): Address {
  const add = ((ppuCtrl & PpuCtrlBit.INCREMENT_MODE) !== 0) ? 32 : 1
  return (ppuAddr + add) & (VRAM_SIZE - 1)
}

function incScroll(t: number, dy: number): number {
  const pageY = ((t >> 11) & 1) * 240
  let y = ((t & 0x03e0) >> (5 - 3)) | ((t >> 12) & 7)
  if (y >= 240)
    y -= 256
  const ny = pageY + y + dy
  const p = (ny / 240) & 1
  const sy = ny % 240
  return (t & ~0x7be0) | ((sy & 0xf8) << (5 - 3)) | ((sy & 0x07) << 12) | (p << 11)
}

function getSpritePat(chrData: Uint8Array, chridx: number, py: number, flipHorz: boolean,
                      chrBankOffset: number[]): number
{
  const idx = chridx + (py & 7) + ((py & 8) << 1)
  const bank = (idx >> 10) & 7
  const p = chrBankOffset[bank] + (idx & 0x03ff)
  let patHi = chrData[p + 8]
  let patLo = chrData[p]
  if (flipHorz) {
    patHi = kFlipXBits[patHi]
    patLo = kFlipXBits[patLo]
  }
  return kStaggered[patLo] | (kStaggered[patHi] << 1)
}

function clearBg(offscreen: Uint8Array, hline0: number, hline1: number, x: number): void {
  const LINE_BYTES = Const.WIDTH
  for (let i = hline0; i < hline1; ++i) {
    const index = i * LINE_BYTES
    for (let j = 0; j < x; ++j)
      offscreen[index + j] = 0
  }
}

function copyOffscreenToPixels(offscreen: Uint8Array, pixels: Uint8Array|Uint8ClampedArray,
                               greyscale: boolean, palet: Uint8Array): void
{
  const n = Const.WIDTH * Const.HEIGHT
  let index = 0
  const colorMask = greyscale ? 0x20 : 0x3f
  for (let i = 0; i < n; ++i) {
    const pal = offscreen[i] & 0x1f
    const col = palet[pal] & colorMask
    const c = kPaletColors[col]
    pixels[index + 0] =  c >> 16
    pixels[index + 1] = (c >>  8) & 0xff
    pixels[index + 2] =  c        & 0xff
    index += 4
  }
}

export default class Ppu {
  public suppressSpriteFlicker = true

  private chrData = new Uint8Array(0)
  private regs = new Uint8Array(REGISTER_COUNT)
  private vram: Uint8Array
  private palet: Uint8Array
  private oam = new Uint8Array(OAM_SIZE)  // Object Attribute Memory
  private mirrorMode = MirrorMode.VERT
  private hcount = 0
  private latch = 0
  private ppuAddr: Address = 0
  private bufferedValue: Byte = 0
  private hevents = new HEvents()
  private hstatusMgr = new HStatusMgr()

  private offscreen = new Uint8Array(Const.WIDTH * Const.HEIGHT)

  constructor() {
    // `palet` is part of `vram`, and shares its content using ArrayBuffer.
    const vramBuffer = new ArrayBuffer(VRAM_SIZE)
    this.vram = new Uint8Array(vramBuffer)
    this.palet = new Uint8Array(vramBuffer, PALET_ADR)

    this.reset()
  }

  public reset(): void {
    this.regs.fill(0)
    this.vram.fill(0)
    this.oam.fill(0)
    this.hcount = 0
    this.ppuAddr = 0
    this.latch = 0
    this.bufferedValue = 0
    this.hevents.clear()
    this.hstatusMgr.reset()
    this.offscreen.fill(0)

    for (let i = 0; i < 16 * 2; ++i)
      this.palet[i] = kInitialPalette[i]
  }

  public save(): object {
    const data: any = {
      regs: Util.convertUint8ArrayToBase64String(this.regs),
      oam: Util.convertUint8ArrayToBase64String(this.oam),
      mirrorMode: this.mirrorMode,
    }

    if (this.isChrRam()) {
      // Save VRAM including ChrRAM
      data.vram = Util.convertUint8ArrayToBase64String(this.vram)
    } else {
      // Save VRAM except ChrROM
      data.vramHigh = Util.convertUint8ArrayToBase64String(this.vram.subarray(0x2000))
    }

    return data
  }

  public load(saveData: any): void {
    const isRam = this.isChrRam()

    this.regs = Util.convertBase64StringToUint8Array(saveData.regs)
    this.oam = Util.convertBase64StringToUint8Array(saveData.oam)
    this.mirrorMode = saveData.mirrorMode

    if (isRam) {
      const vram = Util.convertBase64StringToUint8Array(saveData.vram)
      for (let i = 0; i < vram.length; ++i)
        this.vram[i] = vram[i]
    } else {
      const vramHigh = Util.convertBase64StringToUint8Array(saveData.vramHigh)
      for (let i = 0; i < vramHigh.length; ++i)
        this.vram[i + 0x2000] = vramHigh[i]
    }

    this.hstatusMgr.current.set(HEventType.PPU_CTRL, this.regs[PpuReg.CTRL], -1)
    this.hstatusMgr.current.set(HEventType.PPU_MASK, this.regs[PpuReg.MASK], -1)
    this.hstatusMgr.current.set(HEventType.MIRROR_MODE_BIT,
                                kMirrorModeBitTable[this.mirrorMode], -1)
  }

  public setChrData(chrData: Uint8Array): void {
    const isRam = !(chrData && chrData.length > 0)
    if (isRam)
      this.chrData = this.vram
    else
      this.chrData = chrData
  }

  public setChrBank(value: number): void {
    const base = value << 3
    for (let i = 0; i < 8; ++i)
      this.setChrBankOffset(i, base + i)
  }

  public setChrBankOffset(bank: number, value: number): void {
    const max = this.chrData.length
    const offset = (value << 10) & (max - 1)

    this.incScrollCounter()
    this.addHevent(HEventType.CHR_BANK_OFFSET, offset, bank)
  }

  public getMirrorMode(): MirrorMode {
    return this.mirrorMode
  }

  public setMirrorMode(mode: MirrorMode): void {
    this.mirrorMode = mode
    this.setMirrorModeBit(kMirrorModeBitTable[mode])
  }

  public setMirrorModeBit(bit: Byte): void {
    this.incScrollCounter()
    this.addHevent(HEventType.MIRROR_MODE_BIT, bit)
  }

  public read(reg: number): Byte {
    let result = this.regs[reg]
    switch (reg as PpuReg) {
    case PpuReg.STATUS:
      this.regs[PpuReg.STATUS] &= ~PpuStatusBit.VBLANK
      this.latch = 0
      break
    case PpuReg.OAMDATA:
      result = this.oam[this.regs[PpuReg.OAMADDR]]
      break
    case PpuReg.DATA:
      {
        const ppuAddr = this.hstatusMgr.current.scrollCurr
        const addr = getPpuAddr(ppuAddr, this.hstatusMgr.current.mirrorModeBit)
        if (PALET_ADR <= addr && addr <= PALET_END_ADR) {
          result = this.readPpuDirect(addr)  // Palette read shouldn't be buffered like other VRAM
          // Palette read should also read VRAM into read buffer
          this.bufferedValue = this.readPpuDirect(
            getPpuAddr(ppuAddr - 0x1000, this.hstatusMgr.current.mirrorModeBit))
        } else {
          result = this.bufferedValue
          this.bufferedValue = this.readPpuDirect(addr)
        }
        this.addHevent(HEventType.SCROLL_CURR, incPpuAddr(ppuAddr, this.regs[PpuReg.CTRL]))
      }
      break
    default:
      break
    }
    return result
  }

  public write(reg: number, value: Byte): void {
    if (reg === PpuReg.STATUS) {
      value &= ~(PpuStatusBit.VBLANK | PpuStatusBit.SPRITE0HIT | PpuStatusBit.SPRITE_OVERFLOW)
    }

    this.regs[reg] = value

    switch (reg as PpuReg) {
    case PpuReg.CTRL:
      {
        this.incScrollCounter()
        this.addHevent(HEventType.PPU_CTRL, this.regs[PpuReg.CTRL])
        this.ppuAddr = ((this.ppuAddr & ~0x0c00) |
                        ((value & PpuCtrlBit.BASE_NAMETABLE_ADDRESS) << 10))
        this.updateCoarseX()
      }
      break
    case PpuReg.MASK:
      this.incScrollCounter()
      this.addHevent(HEventType.PPU_MASK, this.regs[PpuReg.MASK])
      break
    case PpuReg.OAMDATA:
      {
        const oamAddr = this.regs[PpuReg.OAMADDR]
        this.oam[oamAddr] = value
        this.regs[PpuReg.OAMADDR] = (oamAddr + 1) & 0xff
      }
      break
    case PpuReg.SCROLL:
      this.incScrollCounter()
      if (this.latch === 0) {
        this.ppuAddr = (this.ppuAddr & ~0x001f) | (value >> 3)
        this.addHevent(HEventType.SCROLL_FINE_X, value & 7)
        this.updateCoarseX()
      } else {
        this.ppuAddr = ((this.ppuAddr & ~0x73e0) | ((value & 0xf8) << (5 - 3)) |
                        ((value & 0x07) << 12))
      }
      this.latch = 1 - this.latch
      break
    case PpuReg.ADDR:
      if (this.latch === 0) {
        this.ppuAddr = (this.ppuAddr & ~0x7f00) | ((value & 0x3f) << 8)
      } else {
        this.ppuAddr = (this.ppuAddr & ~0x00ff) | value

        this.addHevent(HEventType.SCROLL_CURR, this.ppuAddr)
      }
      this.latch = 1 - this.latch
      break
    case PpuReg.DATA:
      {
        const ppuAddr = this.hstatusMgr.current.scrollCurr
        const addr = getPpuAddr(ppuAddr, this.hstatusMgr.current.mirrorModeBit)
        this.vram[addr] = value
        this.addHevent(HEventType.SCROLL_CURR, incPpuAddr(ppuAddr, this.regs[PpuReg.CTRL]))
      }
      break
    default:
      break
    }
  }

  public copyWithDma(array: Uint8Array, start: Address): void {
    const dst = this.oam
    let j = this.regs[PpuReg.OAMADDR]
    for (let i = 0; i < 256; ++i) {
      dst[j] = array[start + i]
      j = (j + 1) & 255
    }
    // TODO: Block CPU.
  }

  public setVBlank(): void {
    this.regs[PpuReg.STATUS] = this.regs[PpuReg.STATUS] | PpuStatusBit.VBLANK
    this.hevents.swap()
    this.hstatusMgr.swap()
  }

  public clearVBlank(): void {
    this.regs[PpuReg.STATUS] &= ~(PpuStatusBit.VBLANK | PpuStatusBit.SPRITE0HIT |
                                  PpuStatusBit.SPRITE_OVERFLOW)

    if ((this.hstatusMgr.current.ppuMask & (PpuMaskBit.SHOW_SPRITE | PpuMaskBit.SHOW_BG)) !== 0)
      this.addHevent(HEventType.SCROLL_CURR, this.ppuAddr)
  }

  public interruptEnable(): boolean {
    return (this.regs[PpuReg.CTRL] & PpuCtrlBit.VINT_ENABLE) !== 0
  }

  public setHcount(hcount: number): void {
    this.hcount = hcount
    this.checkSprite0Hit(hcount)
  }

  public render(pixels: Uint8Array | Uint8ClampedArray): void {
    this.renderOffscreen(this.offscreen)

    const greyscale = (this.regs[PpuReg.MASK] & PpuMaskBit.GREYSCALE) !== 0
    copyOffscreenToPixels(this.offscreen, pixels, greyscale, this.palet)
  }

  public writePpuDirect(addr: Address, value: Byte): void {
    if (addr >= 0x2000) {
      this.vram[addr] = value
    } else {
      const bankOffset = this.hstatusMgr.current.chrBankOffset[(addr >> 10) & 7]
      this.chrData[(addr & 0x3ff) + bankOffset] = value
    }
  }

  public getPaletTable(): Readonly<Uint8Array> {
    return this.palet
  }

  public getRegs(): Readonly<Uint8Array> {
    return this.regs
  }

  public getVram(): Readonly<Uint8Array> {
    return this.vram
  }

  public getChrData(): Readonly<Uint8Array> {
    return this.chrData
  }

  public getHStatusMgr(): HStatusMgr {
    return this.hstatusMgr
  }

  private isChrRam(): boolean {
    return this.chrData === this.vram
  }

  private renderOffscreen(offscreen: Uint8Array) {
    const h = this.hstatusMgr.lastFrame
    const n = this.hevents.getCount()
    let sprChrStart = 0
    for (let i = 0; i < n; ++i) {
      const hevent = this.hevents.getEvent(i)
      h.set(hevent.type, hevent.value, hevent.index)

      const hline0 = hevent.hcount
      const hline1 = this.hevents.getEvent(i + 1).hcount
      if (hline0 >= hline1)
        continue

      // BG
      if ((h.ppuMask & PpuMaskBit.SHOW_BG) === 0) {
        clearBg(offscreen, hline0, hline1, Const.WIDTH)
      } else {
        const baseNameTable = (h.scrollCurr & 0x0c00) >> 10
        const bgChrStart = getBgPatternTableAddress(h.ppuCtrl)
        let x0 = 0
        if ((h.ppuMask & PpuMaskBit.SHOW_BG_LEFT_8PX) === 0) {
          x0 = 8
          clearBg(offscreen, hline0, hline1, x0)
        }

        const scrollX = h.scrollFineX | ((h.scrollCurr & 0x001f) << 3)
        const scrollY = ((h.scrollCurr & 0x7000) >> 12) | ((h.scrollCurr & 0x03e0) >> (5 - 3))

        this.renderBg(offscreen, scrollX, scrollY, baseNameTable, hline0, hline1, x0,
                      h.chrBankOffset, h.mirrorModeBit, bgChrStart)
      }

      // Sprite
      if ((h.ppuMask & PpuMaskBit.SHOW_SPRITE) !== 0) {
        if ((h.ppuCtrl & PpuCtrlBit.SPRITE_SIZE) === 0)
          sprChrStart = (h.ppuCtrl & PpuCtrlBit.SPRITE_PATTERN_TABLE_ADDRESS) << 9
        const x0 = (h.ppuMask & PpuMaskBit.SHOW_SPRITE_LEFT_8PX) ? 0 : 8
        this.renderSprite(offscreen, hline0, hline1, x0, h.chrBankOffset, sprChrStart)
      }
    }
  }

  private renderBg(offscreen: Uint8Array, scrollX: number, scrollY: number,
                   baseNameTable: Address, hline0: number, hline1: number, x0: number,
                   chrBankOffset: number[], mirrorModeBit: Byte, chrStart: Address): void
  {
    scrollX |= 0
    scrollY |= 0
    hline0 |= 0
    hline1 |= 0
    x0 |= 0
    mirrorModeBit |= 0

    const W = 8
    const LINE_WIDTH = Const.WIDTH | 0
    const vram = this.vram

    if (scrollY >= 240)
      scrollY = (scrollY - 256) | 0

    const fineX = scrollX & 7
    const coarseX = scrollX >> 3
    for (let yy = hline0; yy < hline1; ++yy) {
      const yyy = yy - hline0 + scrollY
      const by = ((yyy >> 3) + 60) % 60
      const ay = by % 30

      for (let bbx = 0; bbx < Const.WIDTH / W + 1; ++bbx) {
        const bx = (bbx + coarseX) & 63
        const ax = bx & 31

        const nameTable = getNameTable(baseNameTable, bx, by, mirrorModeBit) | 0
        const name = vram[nameTable + ax + (ay << 5)]
        const chridx = (name << 4) + chrStart
        const palShift = (ax & 2) + ((ay & 2) << 1)
        const atrBlk = (ax >> 2) + ((ay << 1) & 0x0f8)
        const attributeTable = (nameTable + 0x3c0) | 0
        const paletHigh = (((vram[attributeTable + atrBlk] >> palShift) & 3) << 2) | 0

        const px0 = (bbx * W - fineX) | 0
        const pxStart = Math.max(x0 - px0, 0) | 0
        const pxEnd = Math.min(Const.WIDTH - px0, W) | 0
        const pat = getBgPat(this.chrData, chridx, yyy & 7, chrBankOffset)
        for (let px = pxStart; px < pxEnd; ++px) {
          const xx = (px + px0) | 0
          let pal = ((pat >> ((W - 1) * 2 - (px << 1))) & 3) | 0
          if (pal !== 0)
            pal |= paletHigh

          const index = yy * LINE_WIDTH + xx
          offscreen[index] = pal
        }
      }
    }
  }

  private isSprite8x16(): boolean {
    return (this.regs[PpuReg.CTRL] & PpuCtrlBit.SPRITE_SIZE) !== 0
  }

  private renderSprite(offscreen: Uint8Array, hline0: number, hline1: number, x0: number,
                       chrBankOffset: number[], chrStart: Address): void
  {
    const W = 8
    const LINE_WIDTH = Const.WIDTH
    const PALET = 0x03

    const oam = this.oam
    const isSprite8x16 = this.isSprite8x16()
    const sh = isSprite8x16 ? 16 : 8

    for (let h = hline0; h < hline1; ++h) {
      let n = 0
      for (let i = 0; i < MAX_SPRITE; ++i) {
        const y = oam[i * 4 + OamElem.Y] + 1
        if (h < y || h >= y + sh)
          continue

        const oamIndex = oam[i * 4 + OamElem.INDEX]
        const attr = oam[i * 4 + OamElem.ATTR]
        const flipVert = (attr & OamAttrBit.FLIP_VERT) !== 0
        const flipHorz = (attr & OamAttrBit.FLIP_HORZ) !== 0
        const x = oam[i * 4 + OamElem.X]
        const priorityMask = kSpritePriorityMask[(attr >> 5) & 1]

        const chridx = (isSprite8x16
                        ? (oamIndex & 0xfe) * 16 + ((oamIndex & 1) << 12)
                        : oamIndex * 16 + chrStart)
        const paletHigh = (((attr & PALET) << 2) | (0x10 | SPRITE_MASK))

        const py = h - y
        const px0 = Math.max(x0 - x, 0)
        const px1 = Math.min(Const.WIDTH - x, W)
        const ppy = flipVert ? (sh - 1) - py : py
        const pat = getSpritePat(this.chrData, chridx, ppy, flipHorz, chrBankOffset)
        for (let px = px0; px < px1; ++px) {
          const pal = (pat >> ((W - 1 - px) << 1)) & 3
          if (pal === 0)
            continue
          const pixelIndex = (y + py) * LINE_WIDTH + (x + px)
          if ((offscreen[pixelIndex] & priorityMask) !== 0) {
            offscreen[pixelIndex] |= SPRITE_MASK
            continue
          }
          offscreen[pixelIndex] = paletHigh + pal
        }

        if (++n >= MAX_SPRITE_ON_SCANLINE && !this.suppressSpriteFlicker) {
          this.regs[PpuReg.STATUS] |= PpuStatusBit.SPRITE_OVERFLOW
          break
        }
      }
    }
  }

  private checkSprite0Hit(hcount: number): void {
    const mask = PpuMaskBit.SHOW_BG | PpuMaskBit.SHOW_SPRITE
    if ((this.regs[PpuReg.STATUS] & PpuStatusBit.SPRITE0HIT) !== 0 ||
        (this.regs[PpuReg.MASK] & mask) !== mask)
      return

    const sprite0y = this.oam[OamElem.Y] + 1
    if (hcount < sprite0y || hcount >= sprite0y + 16)
      return
    const sprite0x = this.oam[OamElem.X]
    if (sprite0x >= 255)
      return

    const dy = this.getNonEmptySprite0Line()
    if (dy < 0 || hcount !== sprite0y + dy)
      return

    this.regs[PpuReg.STATUS] |= PpuStatusBit.SPRITE0HIT
  }

  private getNonEmptySprite0Line(): number {
    const oam = this.oam
    const chrStart = this.getSpritePatternTableAddress()
    const isSprite8x16 = this.isSprite8x16()
    const h = isSprite8x16 ? 16 : 8
    const index = oam[OamElem.INDEX]
    const attr = oam[OamElem.ATTR]
    const flipVert = (attr & OamAttrBit.FLIP_VERT) !== 0
    const chridx = (isSprite8x16
                    ? (index & 0xfe) * 16 + ((index & 1) << 12)
                    : index * 16 + chrStart)

    for (let py = 0; py < h; ++py) {
      const ppy = flipVert ? (h - 1) - py : py
      const pat = getSpritePat(this.chrData, chridx, ppy, false,
                               this.hstatusMgr.current.chrBankOffset)
      if (pat !== 0)
        return py
    }
    return -1
  }

  private getSpritePatternTableAddress(): Address {
    if ((this.regs[PpuReg.CTRL] & PpuCtrlBit.SPRITE_SIZE) === 0)
      return ((this.regs[PpuReg.CTRL] & PpuCtrlBit.SPRITE_PATTERN_TABLE_ADDRESS) << 9)
    return 0
  }

  private addHevent(type: HEventType, value: number, index = -1): void {
    // Apply immediately to the current state.
    if (!this.hstatusMgr.current.set(type, value, index))
      return

    let hcount = this.hcount + 1
    if (hcount >= Const.HEIGHT) {
      hcount = 0
    }
    this.hevents.add(hcount, type, value, index)
  }

  private incScrollCounter(): void {
    if (!this.visible())
      return
    const lastHcount = this.hevents.getLastHcount()
    if (lastHcount < 0)
      return
    const hcount = this.hcount + 1
    const dy = hcount - lastHcount
    if (dy <= 0)
      return

    this.addHevent(HEventType.SCROLL_CURR, incScroll(this.hstatusMgr.current.scrollCurr, dy))
  }

  private visible(): boolean {
    return this.hcount < Const.HEIGHT &&
      (this.hstatusMgr.current.ppuMask & (PpuMaskBit.SHOW_SPRITE | PpuMaskBit.SHOW_BG)) !== 0
  }

  private updateCoarseX(): void {
    if (this.visible()) {
      // At dot 257 of each scanline:
      const scrollCurr = ((this.hstatusMgr.current.scrollCurr & ~0x041f) |
                          (this.ppuAddr & 0x041f))
      this.addHevent(HEventType.SCROLL_CURR, scrollCurr)
    }
  }

  private readPpuDirect(addr: Address): Byte {
    if (addr >= 0x2000) {
      return this.vram[addr]
    } else {
      const bankOffset = this.hstatusMgr.current.chrBankOffset[(addr >> 10) & 7]
      return this.chrData[(addr & 0x3ff) + bankOffset]
    }
  }
}
