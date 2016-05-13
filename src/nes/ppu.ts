// PPU: Picutre Processing Unit

const REGISTER_COUNT = 8
const VRAM_SIZE = 0x4000

// PPUCTRL ($2000)
const PPUCTRL = 0x00
const VINT_ENABLE = 0x80  // V: 1=Trigger NMI when VBLANK start
const INCREMENT_MODE = 0x04  // I: 1=+32, 0=+1

// PPUSTATUS ($2002)
const PPUSTATUS = 0x02
const VBLANK = 0x80

const PPUADDR = 0x06  // $2006
const PPUDATA = 0x07  // $2007

export class Ppu {
  public regs: Uint8ClampedArray
  public chrData: Uint8ClampedArray
  public vram: Uint8ClampedArray
  private latch: number
  private ppuAddr: number

  constructor() {
    this.regs = new Uint8ClampedArray(REGISTER_COUNT)
    this.vram = new Uint8ClampedArray(VRAM_SIZE)
  }

  public setChrData(chrData: Uint8ClampedArray) {
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

  public setVBlank(): void {
    this.regs[PPUSTATUS] |= VBLANK
  }
  public clearVBlank(): void {
    this.regs[PPUSTATUS] &= ~VBLANK
  }

  public interruptEnable(): boolean {
    return (this.regs[PPUCTRL] & VINT_ENABLE) !== 0
  }

  private incPpuAddr() {
    const add = ((this.regs[PPUCTRL] & INCREMENT_MODE) !== 0) ? 32 : 1
    this.ppuAddr = (this.ppuAddr + add) & (VRAM_SIZE - 1)
  }
}
