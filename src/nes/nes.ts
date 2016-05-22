// NES: Nintendo Entertainment System

import {Apu} from './apu.ts'
import {Const, kColors} from './const.ts'
import {Cpu6502} from './cpu.ts'
import {Ppu} from './ppu.ts'
import {Util} from './util.ts'

const RAM_SIZE = 0x0800

const VBLANK_START = (241 * 341 / 3) | 0
const VBLANK_END = (261 * 341 / 3) | 0
const VRETURN = (262 * 341 / 3) | 0

function triggerCycle(count: number, prev: number, curr: number): boolean {
  return prev < count && curr >= count
}

function loadPrgRom(romData: Uint8Array): Uint8Array {
  const start = 16, size = romData[4] * (16 * 1024)
  const prg = romData.slice(start, start + size)
  return new Uint8Array(prg)
}

function loadChrRom(romData: Uint8Array): Uint8Array {
  const start = 16 + romData[4] * (16 * 1024), size = romData[5] * (8 * 1024)
  const chr = romData.slice(start, start + size)
  return new Uint8Array(chr)
}

export class Nes {
  public apu: Apu
  public cpu: Cpu6502
  public ram: Uint8Array
  public ppu: Ppu

  private romData: Uint8Array
  private context: CanvasRenderingContext2D
  private imageData: ImageData

  public static create(canvas: HTMLCanvasElement, paletCanvas: HTMLCanvasElement): Nes {
    const nes = new Nes(canvas, paletCanvas)
    return nes
  }

  constructor(private canvas: HTMLCanvasElement, private paletCanvas: HTMLCanvasElement) {
    this.cpu = new Cpu6502()
    this.ram = new Uint8Array(RAM_SIZE)
    this.ppu = new Ppu()
    this.apu = new Apu()
    this.setMemoryMap()

    this.canvas.width = Const.WIDTH
    this.canvas.height = Const.HEIGHT

    this.context = this.canvas.getContext('2d')
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
    this.clearPixels()
  }

  public setRomData(romData: Uint8Array): void {
    this.romData = loadPrgRom(romData)
    this.ppu.setChrData(loadChrRom(romData))
    this.ppu.setMirrorMode(romData[6] & 1)
  }

  public reset(): void {
    this.cpu.reset()
    this.ppu.reset()
    this.apu.reset()
  }

  public setPadStatus(no: number, status: number): void {
    this.apu.setPadStatus(no, status)
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

  public step(): number {
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

  public render(): void {
    this.ppu.renderBg(this.imageData)
    this.ppu.renderSprite(this.imageData)
    this.debugPalet()
    this.context.putImageData(this.imageData, 0, 0)
  }

  private setMemoryMap(): void {
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
      return this.apu.read(adr)
    })
    cpu.setWriteMemory(0x4000, 0x5fff, (adr, value) => {  // APU
      switch (adr) {
      case OAMDMA:
        if (0 <= value && value <= 0x1f) {  // RAM
          this.ppu.copyWithDma(this.ram, value << 8)
        } else {
          console.error(`OAMDMA not implemented except for RAM: ${Util.hex(value, 2)}`)
        }
        break
      default:
        this.apu.write(adr, value)
        break
      }
    })
  }

  private interruptVBlank(): void {
    if (!this.ppu.interruptEnable)
      return
    this.interruptNmi()
  }

  private interruptNmi(): void {
    this.cpu.nmi()
  }

  private clearPixels(): void {
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

  private debugPalet(): void {
    const context = this.paletCanvas.getContext('2d')
    context.strokeStyle = ''
    context.fillStyle = `rgb(0,0,0)`
    context.fillRect(0, 0, this.paletCanvas.width, this.paletCanvas.height)

    const vram = this.ppu.vram
    const paletTable = 0x3f00
    for (let i = 0; i < 2; ++i) {
      for (let j = 0; j < 16; ++j) {
        const pal = j + i * 16
        const col = vram[paletTable + pal] & 0x3f
        const r = kColors[col * 3]
        const g = kColors[col * 3 + 1]
        const b = kColors[col * 3 + 2]
        context.fillStyle = `rgb(${r},${g},${b})`
        context.fillRect(j * 4, i * 4, 3, 3)
      }
    }
  }
}
