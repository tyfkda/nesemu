import {MirrorMode} from './ppu/types'

import md5 from 'md5'

function isFormatNes20(romData: Uint8Array): boolean {
  return (romData[7] & 0x0c) === 0x08
}

function getMapperNo(romData: Uint8Array): number {
  return ((romData[6] >> 4) & 0x0f) | (romData[7] & 0xf0)
}

function loadPrgRom(romData: Uint8Array): Uint8Array {
  const start = 16, size = romData[4] * (16 * 1024)
  return new Uint8Array(romData.buffer, start, size)
}

function loadChrRom(romData: Uint8Array): Uint8Array {
  const start = 16 + romData[4] * (16 * 1024), size = romData[5] * (8 * 1024)
  if (romData.byteLength < start + size) {
    console.error(`Illegal romData length, byteLength=${romData.byteLength}, chrRomEnd=${start + size}, size=${size}`)
    const chrRom = new Uint8Array(romData.buffer, start, romData.byteLength - start)
    // TODO: Need resize?
    return chrRom
  }
  return new Uint8Array(romData.buffer, start, size)
}

export class Cartridge {
  public readonly mapperNo: number
  public readonly prgRom: Uint8Array
  public readonly chrRom: Uint8Array

  public static isRomValid(romData: Uint8Array): boolean {
    // Check header.
    return romData[0] === 0x4e && romData[1] === 0x45 && romData[2] === 0x53 && romData[3] === 0x1a
  }

  constructor(private romData: Uint8Array) {
    this.mapperNo = getMapperNo(romData)
    this.prgRom = loadPrgRom(romData)
    this.chrRom = loadChrRom(romData)
  }

  public get mirrorMode() {
    return (this.romData[6] & 1) === 0 ? MirrorMode.HORZ : MirrorMode.VERT
  }

  public get isBatteryOn() {
    return (this.romData[6] & 2) !== 0
  }

  public calcHashValue(): string {
    return md5(this.romData)
  }

  public ramSize(): number {
    if (isFormatNes20(this.romData)) {
      const pp = this.romData[10]
      return 64 << ((pp & 0x0f) + ((pp >> 4) & 0x0f))
    }
    return 0
  }
}
