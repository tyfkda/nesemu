// PPU: Picutre Processing Unit

const REGISTER_COUNT = 8

export class Ppu {
  public regs: Uint8ClampedArray

  constructor() {
    this.regs = new Uint8ClampedArray(REGISTER_COUNT)
  }

  public reset(): void {
    this.regs.fill(0)
  }

  public read(reg): number {
    return this.regs[reg]
  }

  public write(reg, value): void {
    this.regs[reg] = value
  }

  public setVBlank(): void {
    this.regs[2] |= 0x80
  }
  public clearVBlank(): void {
    this.regs[2] &= ~0x80
  }

  public interruptEnable(): boolean {
    return (this.regs[0] & 0x80) !== 0
  }
}
