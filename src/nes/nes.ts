// NES: Nintendo Entertainment System

import {Cpu6502} from './cpu.ts'
import {Pad} from './pad.ts'
import {Ppu} from './ppu.ts'
import {Util} from './util.ts'

const WIDTH = 256
const HEIGHT = 240
const RAM_SIZE = 0x0800

const VBLANK_START = (241 * 341 / 3) | 0
const VBLANK_END = (261 * 341 / 3) | 0
const VRETURN = (262 * 341 / 3) | 0

const kColors: number[] = [
  124, 124, 124,
  0, 0, 252,
  0, 0, 188,
  68, 40, 188,
  148, 0, 132,
  168, 0, 32,
  168, 16, 0,
  136, 20, 0,
  80, 48, 0,
  0, 120, 0,
  0, 104, 0,
  0, 88, 0,
  0, 64, 88,
  0, 0, 0,
  0, 0, 0,
  0, 0, 0,
  188, 188, 188,
  0, 120, 248,
  0, 88, 248,
  104, 68, 252,
  216, 0, 204,
  228, 0, 88,
  248, 56, 0,
  228, 92, 16,
  172, 124, 0,
  0, 184, 0,
  0, 168, 0,
  0, 168, 68,
  0, 136, 136,
  0, 0, 0,
  0, 0, 0,
  0, 0, 0,
  248, 248, 248,
  60, 188, 252,
  104, 136, 252,
  152, 120, 248,
  248, 120, 248,
  248, 88, 152,
  248, 120, 88,
  252, 160, 68,
  248, 184, 0,
  184, 248, 24,
  88, 216, 84,
  88, 248, 152,
  0, 232, 216,
  120, 120, 120,
  0, 0, 0,
  0, 0, 0,
  252, 252, 252,
  164, 228, 252,
  184, 184, 248,
  216, 184, 248,
  248, 184, 248,
  248, 164, 192,
  240, 208, 176,
  252, 224, 168,
  248, 216, 120,
  216, 248, 120,
  184, 248, 184,
  184, 248, 216,
  0, 252, 252,
  248, 216, 248,
  0, 0, 0,
  0, 0, 0,
]

const kStaggered: Uint16Array = (() => {
  const NBIT = 8
  const N = 1 << NBIT
  const array = new Uint16Array(N)
  for (let i = 0; i < N; ++i) {
    let d = 0
    for (let j = 0; j < NBIT; ++j) {
      d <<= 2
      if ((i & (1 << (NBIT - 1 - j))) !== 0)
        d |= 1
    }
    array[i] = d
  }
  return array
})()

const kFlipBits: Uint8Array = (() => {
  const NBIT = 8
  const N = 1 << NBIT
  const array = new Uint8Array(N)
  for (let i = 0; i < N; ++i) {
    let d = 0
    for (let j = 0; j < NBIT; ++j) {
      d <<= 1
      if ((i & (1 << j)) !== 0)
        d |= 1
    }
    array[i] = d
  }
  return array
})()

function triggerCycle(count, prev, curr) {
  return prev < count && curr >= count
}

export class Nes {
  public cpu: Cpu6502
  public ram: Uint8Array
  public ppu: Ppu
  public pad: Pad

  private romData: Uint8Array
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  public static create(canvas: HTMLCanvasElement): Nes {
    const nes = new Nes(canvas)
    return nes
  }

  constructor(private canvas: HTMLCanvasElement) {
    this.cpu = new Cpu6502()
    this.ram = new Uint8Array(RAM_SIZE)
    this.ppu = new Ppu()
    this.pad = new Pad()
    this.setMemoryMap()

    this.canvas.width = WIDTH
    this.canvas.height = HEIGHT

    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, WIDTH, HEIGHT)
    this.clearPixels()
  }

  public setRomData(romData: Uint8Array, chrData: Uint8Array) {
    this.romData = romData
    this.ppu.setChrData(chrData)
  }

  public reset() {
    this.cpu.reset()
    this.ppu.reset()
  }

  public setPadStatus(no: number, status: number): void {
    this.pad.setStatus(no, status)
  }

  public runCycles(cycles: number): number {
    try {
      while (cycles > 0 && !this.cpu.isPaused()) {
        const c = this.step()
        cycles -= c
      }
      return -cycles
    } catch (e) {
      console.error(e)
      this.cpu.pause(true)
    }
  }

  public step() {
    const prevCount = this.cpu.cycleCount
    const cycle = this.cpu.step()
    const currCount = this.cpu.cycleCount

    if (triggerCycle(VBLANK_START, prevCount, currCount)) {
      this.ppu.setVBlank()
      this.interruptVBlank()
    }
    if (triggerCycle(VBLANK_END, prevCount, currCount)) {
      this.ppu.clearVBlank()
    }
    if (triggerCycle(VRETURN, prevCount, currCount)) {
      this.cpu.cycleCount -= VRETURN
    }
    return cycle
  }

  public render() {
    this.renderBg()
    this.renderSprite()
    this.context.putImageData(this.imageData, 0, 0)
  }

  private setMemoryMap() {
    const OAMDMA = 0x4014

    const cpu = this.cpu

    // ROM
    cpu.setReadMemory(0x8000, 0xbfff, (adr) => this.romData[adr & 0x3fff])
    cpu.setReadMemory(0xc000, 0xffff, (adr) => this.romData[adr & 0x3fff])  // Mirror

    // RAM
    cpu.setReadMemory(0x0000, 0x1fff, (adr) => this.ram[adr & (RAM_SIZE - 1)])
    cpu.setWriteMemory(0x0000, 0x1fff, (adr, value) => { this.ram[adr & (RAM_SIZE - 1)] = value })

    cpu.setReadMemory(0x2000, 0x3fff, (adr) => {  // PPU
      const reg = adr & 7
      return this.ppu.read(reg)
    })
    cpu.setWriteMemory(0x2000, 0x3fff, (adr, value) => {  // PPU
      const reg = adr & 7
      this.ppu.write(reg, value)
    })

    cpu.setReadMemory(0x4000, 0x5fff, (adr) => {  // APU
      switch (adr) {
      case 0x4016:  // Pad 1
        return this.pad.shift(0)
      case 0x4017:  // Pad 2
        return this.pad.shift(1)
      default:
        return 0
      }
    })
    cpu.setWriteMemory(0x4000, 0x5fff, (adr, value) => {  // APU
      switch (adr) {
      case 0x4016:  // Pad status. bit0 = Controller shift register strobe
        if ((value & 1) === 0) {
          this.pad.latch()
        }
        break
      case OAMDMA:
        if (0 <= value && value <= 0x1f) {  // RAM
          this.ppu.copyWithDma(this.ram, value << 8)
        } else {
          console.error('OAMDMA not implemented except for RAM: ${Util.hex(value, 2)}')
        }
        break
      default:
        break
      }
    })
  }

  private interruptVBlank() {
    if (!this.ppu.interruptEnable)
      return
    this.interruptNmi()
  }

  private interruptNmi() {
    this.cpu.nmi()
  }

  private clearPixels() {
    const pixels = this.imageData.data
    const n = this.imageData.width * this.imageData.height
    for (let i = 0; i < n; ++i) {
      const index = i * 4
      pixels[index + 0] = 0
      pixels[index + 1] = 0
      pixels[index + 2] = 0
      pixels[index + 3] = 255
    }
  }

  private renderBg() {
    const W = 8
    const chrRom = this.ppu.chrData
    const chrStart = this.ppu.getPatternTableAddress()
    const vram = this.ppu.vram
    const nameTable = this.ppu.getNameTable()
    const attributeTable = nameTable + 0x3c0
    const paletTable = 0x3f00
    const pixels = this.imageData.data
    for (let by = 0; by < HEIGHT / W; ++by) {
      for (let bx = 0; bx < WIDTH / W; ++bx) {
        const name = vram[nameTable + bx + by * 32]
        const chridx = name * 16 + chrStart
        const palShift = (bx & 2) + ((by & 2) << 1)
        const atrBlk = ((bx >> 2) | 0) + ((by >> 2) | 0) * 8
        const paletHigh = ((vram[attributeTable + atrBlk] >> palShift) & 3) << 2

        for (let py = 0; py < W; ++py) {
          const idx = chridx + py
          const pat = (kStaggered[chrRom[idx + 8]] << 1) | kStaggered[chrRom[idx]]
          for (let px = 0; px < W; ++px) {
            const pal = (pat >> ((W - 1 - px) * 2)) & 3
            let r = 0, g = 0, b = 0
            if (pal !== 0) {
              const palet = paletHigh + pal
              const col = vram[paletTable + palet] & 0x3f
              const i = col * 3
              r = kColors[i]
              g = kColors[i + 1]
              b = kColors[i + 2]
            }

            const index = ((by * W + py) * WIDTH + (bx * W + px)) * 4
            pixels[index + 0] = r
            pixels[index + 1] = g
            pixels[index + 2] = b
          }
        }
      }
    }
    this.debugPalet()
  }

  private renderSprite() {
    const W = 8
    const PALET = 0x03
    const FLIP_HORZ = 0x40
    const FLIP_VERT = 0x80

    const oam = this.ppu.oam
    const vram = this.ppu.vram
    const chrRom = this.ppu.chrData
    const chrStart = this.ppu.getPatternTableAddress() ^ 0x1000
    const paletTable = 0x3f10
    const pixels = this.imageData.data

    for (let i = 0; i < 64; ++i) {
      const y = oam[i * 4]
      const index = oam[i * 4 + 1]
      const attr = oam[i * 4 + 2]
      const x = oam[i * 4 + 3]

      const chridx = index * 16 + chrStart
      const paletHigh = (attr & PALET) << 2

      for (let py = 0; py < W; ++py) {
        if (y + py >= HEIGHT)
          break

        const idx = chridx + py
        let patHi = chrRom[idx + 8]
        let patLo = chrRom[idx]
        if ((attr & FLIP_HORZ) !== 0) {
          patHi = kFlipBits[patHi]
          patLo = kFlipBits[patLo]
        }
        const pat = (kStaggered[patHi] << 1) | kStaggered[patLo]
        for (let px = 0; px < W; ++px) {
          if (x + px >= WIDTH)
            break

          const pal = (pat >> ((W - 1 - px) * 2)) & 3
          let r = 0, g = 0, b = 0
          if (pal === 0)
            continue
          const palet = paletHigh + pal
          const col = vram[paletTable + palet] & 0x3f
          const i = col * 3
          r = kColors[i]
          g = kColors[i + 1]
          b = kColors[i + 2]

          const index = ((y + py) * WIDTH + (x + px)) * 4
          pixels[index + 0] = r
          pixels[index + 1] = g
          pixels[index + 2] = b
        }
      }
    }
  }

  private debugPalet() {
    const vram = this.ppu.vram
    const paletTable = 0x3f00
    const pixels = this.imageData.data
    for (let i = 0; i < 2; ++i) {
      for (let j = 0; j < 16; ++j) {
        const pal = j + i * 16
        const col = vram[paletTable + pal] & 0x3f
        const r = kColors[col * 3]
        const g = kColors[col * 3 + 1]
        const b = kColors[col * 3 + 2]
        for (let k = 0; k < 3; ++k) {
          const y = k + i * 4
          for (let l = 0; l < 3; ++l) {
            const x = l + j * 4
            const index = (y * WIDTH + x) * 4
            pixels[index + 0] = r
            pixels[index + 1] = g
            pixels[index + 2] = b
          }
        }
      }
    }
  }
}
