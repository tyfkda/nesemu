// NES: Nintendo Entertainment System

import {Cpu6502} from './cpu.ts'
import {Ppu} from './ppu.ts'

const WIDTH = 256
const HEIGHT = 240
const RAM_SIZE = 0x0800

const VBLANK_START = (241 * 341 / 3)|0
const VBLANK_END = (261 * 341 / 3)|0
const VRETURN = (262 * 341 / 3)|0

function triggerCycle(count, prev, curr) {
  return prev < count && curr >= count
}

export class Nes {
  public cpu: Cpu6502
  public ram: Uint8Array
  public ppu: Ppu

  private romData: Uint8Array
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  public static create(canvas: HTMLCanvasElement): Nes {
    const nes = new Nes(canvas)
    nes.testCanvas()
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

  public setRomData(romData: Uint8Array) {
    this.romData = romData
  }

  public reset() {
    this.cpu.reset()
    this.ppu.reset()
  }

  public step() {
    const prevCount = this.cpu.cycleCount
    this.cpu.step()
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

  private testCanvas() {
    const pixels = this.imageData.data
    for (let i = 0; i < HEIGHT; ++i) {
      for (let j = 0; j < WIDTH; ++j) {
        const index = (i * WIDTH + j) * 4
        pixels[index + 0] = j
        pixels[index + 1] = i
        pixels[index + 2] = 255
        pixels[index + 3] = 255
      }
    }
    this.context.putImageData(this.imageData, 0, 0)
  }
}
