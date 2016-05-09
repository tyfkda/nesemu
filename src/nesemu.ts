import {Cpu6502} from './cpu.ts'

const WIDTH = 256
const HEIGHT = 240
const RAM_SIZE = 0x0800

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export class NesEmu {
  public cpu: Cpu6502
  public ram: Uint8Array
  public ppuRegs: Uint8Array

  private romData: Uint8Array
  private root: HTMLElement
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  public static create(rootId: string): NesEmu {
    const nesEmu = new NesEmu(rootId)
    nesEmu.testCanvas()
    return nesEmu
  }

  constructor(rootId: string) {
    this.cpu = new Cpu6502()
    this.ram = new Uint8Array(RAM_SIZE)
    this.ppuRegs = new Uint8Array(8)
    this.setMemoryMap()

    this.root = document.getElementById(rootId)
    if (this.root) {
      this.canvas = createCanvas(WIDTH, HEIGHT)
      this.context = this.canvas.getContext('2d')
      this.imageData = this.context.getImageData(0, 0, WIDTH, HEIGHT)
      this.root.appendChild(this.canvas)
    }
  }

  public setRomData(romData: Uint8Array) {
    this.romData = romData
  }

  public reset() {
    this.cpu.reset()

    this.ppuRegs[2] = 0x80  // Set vertical blank to proceed, TODO: implement
  }

  public step() {
    this.cpu.step()
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
      return this.ppuRegs[reg]
    })
    cpu.setWriteMemory(0x2000, 0x3fff, (adr, value) => {  // PPU
      const reg = adr & 7
      this.ppuRegs[reg] = value
    })

    cpu.setWriteMemory(0x4000, 0x5fff, (adr, value) => {  // APU
      // TODO: Implement
    })
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
