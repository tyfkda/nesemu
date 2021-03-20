import {Ppu} from '../../../src/nes/ppu/ppu'
import {PpuReg} from '../../../src/nes/ppu/types'

describe('ppu', () => {
  it('Vram read is buffered', () => {
    const ppu = new Ppu()

    ppu.write(PpuReg.CTRL, 0x00)
    ppu.read(PpuReg.STATUS)  // Reset latch
    ppu.write(PpuReg.ADDR, 0x20)
    ppu.write(PpuReg.ADDR, 0x00)
    ppu.write(PpuReg.DATA, 11)
    ppu.write(PpuReg.DATA, 22)

    ppu.read(PpuReg.STATUS)  // Reset latch
    ppu.write(PpuReg.ADDR, 0x20)
    ppu.write(PpuReg.ADDR, 0x00)
    ppu.read(PpuReg.DATA)  // Drop first data read
    expect(ppu.read(PpuReg.DATA)).toBe(11)
    expect(ppu.read(PpuReg.DATA)).toBe(22)
  })

  it('Palet read is not buffered', () => {
    const ppu = new Ppu()

    ppu.write(PpuReg.CTRL, 0x00)
    ppu.read(PpuReg.STATUS)  // Reset latch
    ppu.write(PpuReg.ADDR, 0x3f)
    ppu.write(PpuReg.ADDR, 0x00)
    ppu.write(PpuReg.DATA, 11)
    ppu.write(PpuReg.DATA, 22)

    ppu.read(PpuReg.STATUS)  // Reset latch
    ppu.write(PpuReg.ADDR, 0x3f)
    ppu.write(PpuReg.ADDR, 0x00)
    expect(ppu.read(PpuReg.DATA)).toBe(11)
    expect(ppu.read(PpuReg.DATA)).toBe(22)
  })
})
