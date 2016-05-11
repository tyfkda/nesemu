// NES: Nintendo Entertainment System

import {Cpu6502} from './cpu.ts'
import {Ppu} from './ppu.ts'

const WIDTH = 256
const HEIGHT = 240
const RAM_SIZE = 0x0800

const VBLANK_START = (241 * 341 / 3) | 0
const VBLANK_END = (261 * 341 / 3) | 0
const VRETURN = (262 * 341 / 3) | 0

function triggerCycle(count, prev, curr) {
  return prev < count && curr >= count
}

export class Nes {
  public cpu: Cpu6502
  public ram: Uint8Array
  public ppu: Ppu

  private romData: Uint8ClampedArray
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
    this.setMemoryMap()

    this.canvas.width = WIDTH
    this.canvas.height = HEIGHT

    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, WIDTH, HEIGHT)
  }

  public setRomData(romData: Uint8ClampedArray, chrData: Uint8ClampedArray) {
    this.romData = romData
    this.ppu.setChrData(chrData)
  }

  public reset() {
    this.cpu.reset()
    this.ppu.reset()
  }

  public runCycles(cycles: number): number {
    while (cycles > 0 && !this.cpu.isPaused()) {
      const c = this.step()
      cycles -= c
    }
    return -cycles
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
    this.testCanvas()
  }

  private setMemoryMap() {
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
      // TODO: Implement
      return 0
    })
    cpu.setWriteMemory(0x4000, 0x5fff, (adr, value) => {  // APU
      // TODO: Implement
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

  public testCanvas() {
    const W = 8
    const chrRom = this.ppu.chrData
    const pixels = this.imageData.data
    for (let by = 0; by < HEIGHT / W; ++by) {
      for (let bx = 0; bx < WIDTH / W; ++bx) {
        const chridx = ((bx + by * 32) & 511) * 16
        for (let py = 0; py < W; ++py) {
          for (let px = 0; px < W; ++px) {
            const idx = chridx + py
            const shift = (W - 1) - px
            const pal = (((chrRom[idx + 8] >> shift) & 1) << 1) | ((chrRom[idx] >> shift) & 1)
            const col = pal << 6

            const index = ((by * W + py) * WIDTH + (bx * W + px)) * 4
            pixels[index + 0] = col
            pixels[index + 1] = col
            pixels[index + 2] = col
            pixels[index + 3] = 255
          }
        }
      }
    }
    this.context.putImageData(this.imageData, 0, 0)
  }
}
