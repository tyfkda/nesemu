// PPU: Picutre Processing Unit

// PPU scrolling
// https://wiki.nesdev.com/w/index.php/PPU_scrolling

import {Const, kColors, kStaggered, kFlipBits} from './const'
import {Address, Byte, Word} from './types'
import Util from '../util/util'

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
const SHOW_SPRITE = 0x10
const SHOW_BG = 0x08
const SHOW_SPRITE_LEFT_8PX = 0x04
const SHOW_BG_LEFT_8PX = 0x02

// PPUSTATUS ($2002)
const PPUSTATUS = 0x02
const VBLANK = 0x80
const SPRITE0HIT = 0x40
const SPRITE_OVERFLOW = 0x20

// OAMADDR ($2003)
const OAMADDR = 0x03

// OAMDATA ($2004)
const OAMDATA = 0x04
const MAX_SPRITE = 64

const PPUSCROLL = 0x05  // $2005
const PPUADDR = 0x06  // $2006
const PPUDATA = 0x07  // $2007

// Sprite
const FLIP_HORZ = 0x40
const FLIP_VERT = 0x80

// Palette
const PALET_ADR = 0x3f00
const PALET_END_ADR = 0x3fff

export enum MirrorMode {
  HORZ = 0,
  VERT = 1,
  SINGLE0 = 2,
  SINGLE1 = 3,
}

class HEvents {
  private count = 0
  private events = new Array<any>()
  private eventsAlt = new Array<any>()

  public clear(): void {
    this.count = 0
  }

  public swap(): void {
    const tmp = this.events
    this.events = this.eventsAlt
    this.eventsAlt = tmp
    this.count = 0
  }

  public getCount(): number {
    return this.count
  }

  public getEvent(index: number): any {
    return this.events[index]
  }

  public add(hcount: number, hevent: any): void {
    let n = this.count
    if (n <= 0 || this.events[n - 1].hcount !== hcount) {
      if (++n >= this.events.length) {
        this.events.push({})
      }
    }
    let event = this.events[n - 1]
    event.hcount = hcount
    Object.keys(hevent).forEach(key => {
      event[key] = hevent[key]
    })
    this.count = n
  }
}

const kMirrorModeBitTable = [0x50, 0x44, 0x00, 0x55]

const kInitialPalette = [
  0x09, 0x01, 0x00, 0x01, 0x00, 0x02, 0x02, 0x0d, 0x08, 0x10, 0x08, 0x24, 0x00, 0x00, 0x04, 0x2c,
  0x09, 0x01, 0x34, 0x03, 0x00, 0x04, 0x00, 0x14, 0x08, 0x3a, 0x00, 0x02, 0x00, 0x20, 0x2c, 0x08,
]

const SPRITE_MASK = 0x80
const kSpritePriorityMask = [SPRITE_MASK, 0xff]

function cloneArray(array) {
  return array.concat()
}

function getNameTable(baseNameTable: Address, bx: number, by: number,
                      mirrorModeBit: number): Address
{
  const page = (((bx >> 5) & 1) + (((by / 30) & 1) << 1)) ^ baseNameTable  // 0~3
  const m = (mirrorModeBit << (10 - (page << 1))) & 0x0c00
  return 0x2000 + m
}

function getPpuAddr(adr: Address, mirrorModeBit: number): Address {
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
  const add = ((ppuCtrl & INCREMENT_MODE) !== 0) ? 32 : 1
  return (ppuAddr + add) & (VRAM_SIZE - 1)
}

function getBgPatternTableAddress(ppuCtrl: Byte): Address {
  return (ppuCtrl & BG_PATTERN_TABLE_ADDRESS) << 8
}

function copyOffscreenToPixels(offscreen: Uint8Array, pixels: Uint8ClampedArray,
                               vram: Uint8Array): void
{
  const paletTable: Address = PALET_ADR
  const n = Const.WIDTH * Const.HEIGHT
  let index = 0
  for (let i = 0; i < n; ++i) {
    const pal = offscreen[i] & 0x1f
    const col = vram[paletTable + pal] & 0x3f
    const c = col * 3
    pixels[index + 0] = kColors[c]
    pixels[index + 1] = kColors[c + 1]
    pixels[index + 2] = kColors[c + 2]
    index += 4
  }
}

export class Ppu {
  private chrData: Uint8Array
  private regs = new Uint8Array(REGISTER_COUNT)
  private vram = new Uint8Array(VRAM_SIZE)
  private oam = new Uint8Array(OAM_SIZE)  // Object Attribute Memory
  private mirrorMode = MirrorMode.VERT
  private mirrorModeBit = 0x44  // 2bit x 4screen
  private hcount: number
  private latch: number
  private ppuAddr: Address
  private bufferedValue: Byte
  private chrBankOffset = new Array<number>(8)
  private hevents = new HEvents()

  private isChrRam = false
  private scrollCurr: Word = 0
  private scrollTemp: Word = 0
  private scrollFineX: number = 0

  private offscreen = new Uint8Array(Const.WIDTH * Const.HEIGHT)

  constructor() {
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
    this.offscreen.fill(0)

    for (let i = 0; i < 8; ++i)
      this.chrBankOffset[i] = i << 10

    for (let i = 0; i < 16 * 2; ++i)
      this.vram[PALET_ADR + i] = kInitialPalette[i]
  }

  public save(): object {
    return {
      regs: Util.convertUint8ArrayToBase64String(this.regs),
      vram: Util.convertUint8ArrayToBase64String(this.vram),
      oam: Util.convertUint8ArrayToBase64String(this.oam),
      mirrorMode: this.mirrorMode,
      mirrorModeBit: this.mirrorModeBit,
      isChrRam: this.isChrRam,
    }
  }

  public load(saveData: any): void {
    this.regs = Util.convertBase64StringToUint8Array(saveData.regs)
    this.vram = Util.convertBase64StringToUint8Array(saveData.vram)
    this.oam = Util.convertBase64StringToUint8Array(saveData.oam)
    this.mirrorMode = saveData.mirrorMode
    this.mirrorModeBit = saveData.mirrorModeBit
    this.isChrRam = saveData.isChrRam

    if (this.isChrRam)
      this.chrData = this.vram
  }

  public setChrData(chrData: Uint8Array): void {
    this.isChrRam = !(chrData && chrData.length > 0)
    if (this.isChrRam)
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
    this.chrBankOffset[bank] = (value << 10) & (max - 1)  // 0x0400

    this.incScrollCounter()
    this.addHevent({ppuCtrl: this.regs[PPUCTRL], ppuMask: this.regs[PPUMASK],
                    chrBankOffset: cloneArray(this.chrBankOffset),
                    mirrorModeBit: this.mirrorModeBit, scrollCurr: this.scrollCurr,
                    scrollFineX: this.scrollFineX})
  }

  public getMirrorMode(): MirrorMode {
    return this.mirrorMode
  }

  public setMirrorMode(mode: MirrorMode): void {
    this.mirrorMode = mode
    this.mirrorModeBit = kMirrorModeBitTable[mode]

    this.incScrollCounter()
    this.addHevent({ppuCtrl: this.regs[PPUCTRL], ppuMask: this.regs[PPUMASK],
                    chrBankOffset: cloneArray(this.chrBankOffset),
                    mirrorModeBit: this.mirrorModeBit, scrollCurr: this.scrollCurr,
                    scrollFineX: this.scrollFineX})
  }

  public read(reg: number): Byte {
    let result = this.regs[reg]
    switch (reg) {
    case PPUSTATUS:
      this.regs[PPUSTATUS] &= ~VBLANK
      this.latch = 0
      break
    case OAMDATA:
      result = this.oam[this.regs[OAMADDR]]
      break
    case PPUDATA:
      {
        const ppuAddr = this.ppuAddr
        const addr = getPpuAddr(ppuAddr, this.mirrorModeBit)
        if (PALET_ADR <= addr && addr <= PALET_END_ADR) {
          result = this.readPpuDirect(addr)  // Palette read shouldn't be buffered like other VRAM
          // Palette read should also read VRAM into read buffer
          this.bufferedValue = this.readPpuDirect(getPpuAddr(ppuAddr - 0x1000, this.mirrorModeBit))
        } else {
          result = this.bufferedValue
          this.bufferedValue = this.readPpuDirect(addr)
        }
        this.ppuAddr = incPpuAddr(this.ppuAddr, this.regs[PPUCTRL])
      }
      break
    default:
      break
    }
    return result
  }

  public write(reg: number, value: Byte): void {
    if (reg === PPUSTATUS) {
      value &= ~(VBLANK | SPRITE0HIT | SPRITE_OVERFLOW)
    }

    this.regs[reg] = value

    switch (reg) {
    case PPUCTRL:
      this.incScrollCounter()
      this.scrollTemp = (this.scrollTemp & ~0x0c00) | ((value & BASE_NAMETABLE_ADDRESS) << 10)
      // At dot 257 of each scanline:
      this.scrollCurr = (this.scrollCurr & ~0x041f) | (this.scrollTemp & 0x041f)
      // if (this.hcount >= 280 && this.hcount < 304) {
      //   this.scrollCurr = (this.scrollCurr & ~0x7be0) | (this.scrollTemp & 0x7be0)
      // }

      this.addHevent({ppuCtrl: this.regs[PPUCTRL], ppuMask: this.regs[PPUMASK],
                      chrBankOffset: cloneArray(this.chrBankOffset),
                      mirrorModeBit: this.mirrorModeBit, scrollCurr: this.scrollCurr,
                      scrollFineX: this.scrollFineX})
      break
    case PPUMASK:
      this.incScrollCounter()
      this.addHevent({ppuCtrl: this.regs[PPUCTRL], ppuMask: this.regs[PPUMASK],
                      chrBankOffset: cloneArray(this.chrBankOffset),
                      mirrorModeBit: this.mirrorModeBit, scrollCurr: this.scrollCurr,
                      scrollFineX: this.scrollFineX})
      break
    case OAMDATA:
      {
        const oamAddr = this.regs[OAMADDR]
        this.oam[oamAddr] = value
        this.regs[OAMADDR] = (oamAddr + 1) & 0xff
      }
      break
    case PPUSCROLL:
      this.incScrollCounter()
      if (this.latch === 0) {
        this.scrollTemp = (this.scrollTemp & ~0x001f) | (value >> 3)
        this.scrollFineX = value & 0x07
        // At dot 257 of each scanline:
        this.scrollCurr = (this.scrollCurr & ~0x041f) | (this.scrollTemp & 0x041f)
      } else {
        this.scrollTemp = ((this.scrollTemp & ~0x73e0) | ((value & 0xf8) << (5 - 3)) |
                           ((value & 0x07) << 12))
      }
      this.addHevent({ppuCtrl: this.regs[PPUCTRL], ppuMask: this.regs[PPUMASK],
                      chrBankOffset: cloneArray(this.chrBankOffset),
                      mirrorModeBit: this.mirrorModeBit, scrollCurr: this.scrollCurr,
                      scrollFineX: this.scrollFineX})
      this.latch = 1 - this.latch
      break
    case PPUADDR:
      if (this.latch === 0) {
        this.scrollTemp = (this.scrollTemp & ~0x7f00) | ((value & 0x3f) << 8)
        this.ppuAddr = value
      } else {
        this.scrollTemp = (this.scrollTemp & ~0x00ff) | value
        this.scrollCurr = this.scrollTemp
        this.ppuAddr = this.scrollCurr

        this.addHevent({ppuCtrl: this.regs[PPUCTRL], ppuMask: this.regs[PPUMASK],
                        chrBankOffset: cloneArray(this.chrBankOffset),
                        mirrorModeBit: this.mirrorModeBit, scrollCurr: this.scrollCurr,
                        scrollFineX: this.scrollFineX})
      }
      this.latch = 1 - this.latch
      break
    case PPUDATA:
      {
        const addr = getPpuAddr(this.ppuAddr, this.mirrorModeBit)
        this.vram[addr] = value
        this.ppuAddr = incPpuAddr(this.ppuAddr, this.regs[PPUCTRL])
      }
      break
    default:
      break
    }
  }

  public copyWithDma(array: Uint8Array, start: Address): void {
    const dst = this.oam
    let j = this.regs[OAMADDR]
    for (let i = 0; i < 256; ++i) {
      dst[j] = array[start + i]
      j = (j + 1) & 255
    }
    // TODO: Block CPU.
  }

  public setVBlank(): void {
    this.regs[PPUSTATUS] = this.regs[PPUSTATUS] | VBLANK

    this.hevents.swap()

    this.addHevent({ppuCtrl: this.regs[PPUCTRL], ppuMask: this.regs[PPUMASK],
                    chrBankOffset: cloneArray(this.chrBankOffset),
                    mirrorModeBit: this.mirrorModeBit, scrollCurr: this.scrollCurr,
                    scrollFineX: this.scrollFineX})
  }

  public clearVBlank(): void {
    this.regs[PPUSTATUS] &= ~(VBLANK | SPRITE0HIT)

    this.scrollCurr = this.scrollTemp
    this.addHevent({ppuCtrl: this.regs[PPUCTRL], ppuMask: this.regs[PPUMASK],
                    chrBankOffset: cloneArray(this.chrBankOffset),
                    mirrorModeBit: this.mirrorModeBit, scrollCurr: this.scrollCurr,
                    scrollFineX: this.scrollFineX})
  }

  public interruptEnable(): boolean {
    return (this.regs[PPUCTRL] & VINT_ENABLE) !== 0
  }

  public getSpritePatternTableAddress(): Address {
    if ((this.regs[PPUCTRL] & SPRITE_SIZE) === 0)
      return ((this.regs[PPUCTRL] & SPRITE_PATTERN_TABLE_ADDRESS) << 9)
    return 0
  }

  public setHcount(hcount: number) {
    this.hcount = hcount
    this.checkSprite0Hit(hcount)
  }

  public render(pixels: Uint8ClampedArray): void {
    const n = this.hevents.getCount()
    let sprChrStart = 0
    for (let i = 0; i < n; ++i) {
      const h = this.hevents.getEvent(i)
      const hline0 = h.hcount
      const hline1 = i < n - 1 ? this.hevents.getEvent(i + 1).hcount : Const.HEIGHT
      if (hline0 >= hline1)
        continue

      // BG
      if ((h.ppuMask & SHOW_BG) === 0) {
        this.clearBg(this.offscreen, hline0, hline1, Const.WIDTH)
      } else {
        const baseNameTable = (h.scrollCurr & 0x0c00) >> 10
        const bgChrStart = getBgPatternTableAddress(h.ppuCtrl)
        let x0 = 0
        if ((h.ppuMask & SHOW_BG_LEFT_8PX) === 0) {
          x0 = 8
          this.clearBg(this.offscreen, hline0, hline1, x0)
        }

        const scrollX = h.scrollFineX | ((h.scrollCurr & 0x001f) << 3)
        const scrollY = ((h.scrollCurr & 0x7000) >> 12) | ((h.scrollCurr & 0x03e0) >> (5 - 3))

        this.doRenderBg(scrollX, scrollY, baseNameTable, hline0, hline1, x0,
                        h.chrBankOffset, h.mirrorModeBit, bgChrStart)
      }

      // Sprite
      if ((h.ppuMask & SHOW_SPRITE) !== 0) {
        if ((h.ppuCtrl & SPRITE_SIZE) === 0)
          sprChrStart = (h.ppuCtrl & SPRITE_PATTERN_TABLE_ADDRESS) << 9
        const x0 = (h.ppuMask & SHOW_SPRITE_LEFT_8PX) ? 0 : 8
        this.renderSprite2(hline0, hline1, x0, h.chrBankOffset, sprChrStart)
      }
    }

    copyOffscreenToPixels(this.offscreen, pixels, this.vram)
  }

  public renderPattern(pixels: Uint8ClampedArray, lineWidth: number, colors: number[]): void {
    const W = 8
    for (let i = 0; i < 2; ++i) {
      for (let by = 0; by < 16; ++by) {
        for (let bx = 0; bx < 16; ++bx) {
          const chridx = (bx + by * 16 + i * 256) * 16
          for (let py = 0; py < W; ++py) {
            const yy = by * W + py
            const idx = chridx + py
            const pat = ((kStaggered[this.readPpuDirect(idx + 8)] << 1) |
                         kStaggered[this.readPpuDirect(idx)])
            for (let px = 0; px < W; ++px) {
              const xx = bx * W + px + i * (W * 16)
              const col = (pat >> ((W - 1 - px) << 1)) & 3
              const c = col * 3

              const index = (yy * lineWidth + xx) * 4
              pixels[index + 0] = colors[c + 0]
              pixels[index + 1] = colors[c + 1]
              pixels[index + 2] = colors[c + 2]
            }
          }
        }
      }
    }
  }

  public writePpuDirect(addr: Address, value: Byte): void {
    if (addr >= 0x2000) {
      this.vram[addr] = value
    } else {
      const bankOffset = this.chrBankOffset[(addr >> 10) & 7]
      this.chrData[(addr & 0x3ff) + bankOffset] = value
    }
  }

  public dumpVram(start: Address, count: number): void {
    const mem = new Array<Byte>()
    for (let i = 0; i < count; ++i) {
      mem.push(this.vram[getPpuAddr(start + i, this.mirrorModeBit)])
    }

    for (let i = 0; i < count; i += 16) {
      const line = mem.splice(0, 16).map(x => Util.hex(x, 2)).join(' ')
      console.log(`${Util.hex(start + i, 4)}: ${line}`)
    }
  }

  public renderNameTable1(pixels: Uint8ClampedArray, lineWidth: number,
                          startX: number, startY: number, nameTableOffset: number): void
  {
    const W = 8
    const chrStart = getBgPatternTableAddress(this.regs[PPUCTRL])
    const vram = this.vram
    const paletTable = PALET_ADR

    const clearColor = vram[paletTable] & 0x3f  // Universal background color
    const clearR = kColors[clearColor * 3 + 0]
    const clearG = kColors[clearColor * 3 + 1]
    const clearB = kColors[clearColor * 3 + 2]

    for (let bby = 0; bby < Const.HEIGHT / W; ++bby) {
      const by = (bby + 60) % 60
      const ay = by % 30
      for (let bbx = 0; bbx < Const.WIDTH / W; ++bbx) {
        const bx = bbx & 63
        const ax = bx & 31

        const nameTable = getNameTable(0, bx, by, this.mirrorModeBit) + nameTableOffset
        const name = vram[nameTable + ax + (ay << 5)]
        const chridx = name * 16 + chrStart
        const palShift = (ax & 2) + ((ay & 2) << 1)
        const atrBlk = (ax >> 2) + ((ay << 1) & 0x0f8)
        const attributeTable = nameTable + 0x3c0
        const paletHigh = ((vram[attributeTable + atrBlk] >> palShift) & 3) << 2

        for (let py = 0; py < W; ++py) {
          const yy = bby * W + py
          let pat = this.getBgPat(chridx, py, this.chrBankOffset)
          for (let px = 0; px < W; ++px) {
            const xx = bbx * W + px
            const pal = pat >> 14  // & 3
            pat = (pat << 2) & 0xffff
            let r = clearR, g = clearG, b = clearB
            if (pal !== 0) {
              const palet = paletHigh + pal
              const col = vram[paletTable + palet] & 0x3f
              const c = col * 3
              r = kColors[c]
              g = kColors[c + 1]
              b = kColors[c + 2]
            }

            const index = ((yy + startY) * lineWidth + (xx + startX)) * 4
            pixels[index + 0] = r
            pixels[index + 1] = g
            pixels[index + 2] = b
          }
        }
      }
    }
  }

  public getPalet(pal: number): number {
    return this.vram[PALET_ADR + (pal & 31)] & 0x3f
  }

  public getReg(index: number): Byte {
    return this.regs[index]
  }

  private doRenderBg(scrollX: number, scrollY: number,
                     baseNameTable: Address, hline0: number, hline1: number, x0: number,
                     chrBankOffset: number[], mirrorModeBit: number, chrStart: Address): void
  {
    const W = 8
    const LINE_WIDTH = Const.WIDTH
    const vram = this.vram
    const offscreen = this.offscreen

    if (scrollY >= 240)
      scrollY = (scrollY - 256)

    for (let yy = hline0; yy < hline1; ++yy) {
      const yyy = yy - hline0 + scrollY
      const by = ((yyy >> 3) + 60) % 60
      const ay = by % 30

      for (let bbx = 0; bbx < Const.WIDTH / W + 1; ++bbx) {
        const bx = (bbx + (scrollX >> 3)) & 63
        const ax = bx & 31

        const nameTable = getNameTable(baseNameTable, bx, by, mirrorModeBit)
        const name = vram[nameTable + ax + (ay << 5)]
        const chridx = name * 16 + chrStart
        const palShift = (ax & 2) + ((ay & 2) << 1)
        const atrBlk = (ax >> 2) + ((ay << 1) & 0x0f8)
        const attributeTable = nameTable + 0x3c0
        const paletHigh = ((vram[attributeTable + atrBlk] >> palShift) & 3) << 2

        const px0 = bbx * W - (scrollX & 7)
        const pxStart = Math.max(x0 - px0, 0)
        const pxEnd = Math.min(Const.WIDTH - px0, W)
        let pat = this.getBgPat(chridx, yyy & 7, chrBankOffset)
        pat = (pat << (pxStart * 2)) & 0xffff
        for (let px = pxStart; px < pxEnd; ++px) {
          const xx = px + px0
          let pal = pat >> 14  // & 3
          pat = (pat << 2) & 0xffff
          if (pal !== 0)
            pal |= paletHigh

          const index = yy * LINE_WIDTH + xx
          offscreen[index] = pal
        }
      }
    }
  }

  private clearBg(offscreen: Uint8Array, hline0: number, hline1: number, x: number): void {
    const LINE_BYTES = Const.WIDTH
    for (let i = hline0; i < hline1; ++i) {
      let index = i * LINE_BYTES
      for (let j = 0; j < x; ++j)
        offscreen[index + j] = 0
    }
  }

  private isSprite8x16(): boolean {
    return (this.regs[PPUCTRL] & SPRITE_SIZE) !== 0
  }

  private renderSprite2(hline0: number, hline1: number, x0: number,
                        chrBankOffset: number[], chrStart: Address): void
  {
    const W = 8
    const LINE_WIDTH = Const.WIDTH
    const PALET = 0x03

    const offscreen = this.offscreen
    const oam = this.oam
    const isSprite8x16 = this.isSprite8x16()
    const h = isSprite8x16 ? 16 : 8

    for (let i = 0; i < MAX_SPRITE; ++i) {
      const y = oam[i * 4] + 1
      if (y + h < hline0 || y >= hline1)
        continue

      const oamIndex = oam[i * 4 + 1]
      const attr = oam[i * 4 + 2]
      const flipVert = (attr & FLIP_VERT) !== 0
      const flipHorz = (attr & FLIP_HORZ) !== 0
      const x = oam[i * 4 + 3]
      const priorityMask = kSpritePriorityMask[(attr >> 5) & 1]

      const chridx = (isSprite8x16
                      ? (oamIndex & 0xfe) * 16 + ((oamIndex & 1) << 12)
                      : oamIndex * 16 + chrStart)
      const paletHigh = (((attr & PALET) << 2) | (0x10 | SPRITE_MASK))

      const py0 = Math.max(0, hline0 - y)
      const py1 = Math.min(h, Math.min(hline1 - y, Const.HEIGHT - y))
      const px0 = Math.max(x0 - x, 0)
      const px1 = Math.min(Const.WIDTH - x, W)
      for (let py = py0; py < py1; ++py) {
        const ppy = flipVert ? (h - 1) - py : py
        const pat = this.getSpritePat(chridx, ppy, flipHorz, chrBankOffset)
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
      }
    }
  }

  private getBgPat(chridx: number, py: number, chrBankOffset: number[]): number {
    const idx = chridx + py
    const bank = (idx >> 10) & 7
    const p = chrBankOffset[bank] + (idx & 0x03ff)
    return kStaggered[this.chrData[p]] | (kStaggered[this.chrData[p + 8]] << 1)
  }

  private getSpritePat(chridx: number, ppy: number, flipHorz: boolean,
                       chrBankOffset: number[]): number
  {
    const idx = chridx + (ppy & 7) + ((ppy & 8) << 1)
    const bank = (idx >> 10) & 7
    const p = chrBankOffset[bank] + (idx & 0x03ff)
    let patHi = this.chrData[p + 8]
    let patLo = this.chrData[p]
    if (flipHorz) {
      patHi = kFlipBits[patHi]
      patLo = kFlipBits[patLo]
    }
    return kStaggered[patLo] | (kStaggered[patHi] << 1)
  }

  private checkSprite0Hit(hcount: number): void {
    if ((this.regs[PPUSTATUS] & SPRITE0HIT) !== 0 ||
        (this.regs[PPUMASK] & (SHOW_BG | SHOW_SPRITE)) !== (SHOW_BG | SHOW_SPRITE))
      return

    const sprite0y = this.oam[0]
    if (hcount < sprite0y || hcount >= sprite0y + 16)
      return
    const sprite0x = this.oam[3]
    if (sprite0x >= 255)
      return

    const dy = this.getNonEmptySprite0Line()
    if (dy < 0 || hcount !== sprite0y + dy)
      return

    this.regs[PPUSTATUS] |= SPRITE0HIT
  }

  private getNonEmptySprite0Line(): number {
    const oam = this.oam
    const chrStart = this.getSpritePatternTableAddress()
    const isSprite8x16 = this.isSprite8x16()
    const h = isSprite8x16 ? 16 : 8
    const i = 0
    const index = oam[i * 4 + 1]
    const attr = oam[i * 4 + 2]
    const flipVert = (attr & FLIP_VERT) !== 0
    const chridx = (isSprite8x16
                    ? (index & 0xfe) * 16 + ((index & 1) << 12)
                    : index * 16 + chrStart)

    for (let py = 0; py < h; ++py) {
      const ppy = flipVert ? (h - 1) - py : py
      const pat = this.getSpritePat(chridx, ppy, false, this.chrBankOffset)
      if (pat !== 0)
        return py
    }
    return -1
  }

  private addHevent(hevent: any): void {
    let hcount = this.hcount + 1
    if (hcount >= Const.HEIGHT)
      hcount = 0
    this.hevents.add(hcount, hevent)
  }

  private incScrollCounter(): void {
    const n = this.hevents.getCount()
    if (n <= 0)
      return
    const h = this.hevents.getEvent(n - 1)
    const hcount = this.hcount < Const.HEIGHT - 1 ? this.hcount + 1 : 0
    const dy = hcount - h.hcount
    if (dy <= 0)
      return

    const inc = (t) => {
      let pageY = ((t >> 11) & 1) * 240
      let y = ((t & 0x03e0) >> (5 - 3)) | ((t >> 12) & 7)
      if (y >= 240)
        y -= 256
      const ny = pageY + y + dy
      const p = (ny / 240) & 1
      const sy = ny % 240
      return (t & ~0x7be0) | ((sy & 0xf8) << (5 - 3)) | ((sy & 0x07) << 12) | (p << 11)
    }

    this.scrollTemp = inc(this.scrollTemp)
    this.scrollCurr = inc(this.scrollCurr)
  }

  private readPpuDirect(addr: Address): Byte {
    if (addr >= 0x2000) {
      return this.vram[addr]
    } else {
      const bankOffset = this.chrBankOffset[(addr >> 10) & 7]
      return this.chrData[(addr & 0x3ff) + bankOffset]
    }
  }
}
