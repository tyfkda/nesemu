// PPU: Picutre Processing Unit

import {Util} from './util.ts'

const REGISTER_COUNT = 8
const VRAM_SIZE = 0x4000
const OAM_SIZE = 0x0100

// PPUCTRL ($2000)
const PPUCTRL = 0x00
const VINT_ENABLE = 0x80  // V: 1=Trigger NMI when VBLANK start
const BG_PATTERN_TABLE_ADDRESS = 0x10
const INCREMENT_MODE = 0x04  // I: 1=+32, 0=+1
const BASE_NAMETABLE_ADDRESS = 0x03

// PPUSTATUS ($2002)
const PPUSTATUS = 0x02
const VBLANK = 0x80

// OAMADDR ($2003)
const OAMADDR = 0x03

// OAMDATA ($2004)
const OAMDATA = 0x04

const PPUSCROLL = 0x05  // $2005
const PPUADDR = 0x06  // $2006
const PPUDATA = 0x07  // $2007

export class Ppu {
  public regs: Uint8Array
  public chrData: Uint8Array
  public vram: Uint8Array
  public oam: Uint8Array  // Object Attribute Memory
  public scrollX: number
  public scrollY: number
  private latch: number
  private ppuAddr: number

  constructor() {
    this.regs = new Uint8Array(REGISTER_COUNT)
    this.vram = new Uint8Array(VRAM_SIZE)
    this.oam = new Uint8Array(OAM_SIZE)
  }

  public setChrData(chrData: Uint8Array) {
    this.chrData = chrData
  }

  public reset(): void {
    this.regs.fill(0)
    this.latch = 0
  }

  public read(reg): number {
    const result = this.regs[reg]
    switch (reg) {
    case PPUSTATUS:
      //this.regs[PPUSTATUS] &= ~VBLANK
      this.latch = 0
      break
    case PPUDATA:
      this.incPpuAddr()
      break
    default:
      break
    }
    return result
  }

  public write(reg, value): void {
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
      this.vram[this.ppuAddr] = value
      this.incPpuAddr()
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
    this.regs[PPUSTATUS] |= VBLANK
  }
  public clearVBlank(): void {
    this.regs[PPUSTATUS] &= ~VBLANK
  }

  public interruptEnable(): boolean {
    return (this.regs[PPUCTRL] & VINT_ENABLE) !== 0
  }

  public getNameTable(): number {
    return 0x2000 + ((this.regs[PPUCTRL] & BASE_NAMETABLE_ADDRESS) << 10)
  }

  public getPatternTableAddress(): number {
    return ((this.regs[PPUCTRL] & BG_PATTERN_TABLE_ADDRESS) << 8)
  }

  private incPpuAddr(): void {
    const add = ((this.regs[PPUCTRL] & INCREMENT_MODE) !== 0) ? 32 : 1
    this.ppuAddr = (this.ppuAddr + add) & (VRAM_SIZE - 1)
  }
}
