// For disk image
// https://wiki.nesdev.com/w/index.php/Family_Computer_Disk_System
// https://wiki.nesdev.com/w/index.php/FDS_BIOS

import {Address, Byte} from '../types'
import {Mapper, MapperOptions} from '../mapper/mapper'
import {Nes} from '../nes'
import {MirrorMode} from '../ppu/types'

// $402x: write-only registers
const IRQ_RELOAD_L         = 0
const IRQ_RELOAD_H         = 1
const IRQ_CTRL             = 2
const MASTER_IO_ENABLE     = 3
const WRITE_DATA           = 4
const FDS_CTRL             = 5
const EXTERNAL_CONNECTOR_W = 6

// $403x: read-only registers
const DISK_STATUS          = 0
const READ_DATA            = 1
const DRIVE_STATUS         = 2
const EXTERNAL_CONNECTOR_R = 3

const IRQ_CTRL_REPEAT  = 0 << 1
const IRQ_CTRL_ENABLED = 1 << 1

const MASTER_IO_ENABLE_DISK  = 1 << 0
//const MASTER_IO_ENABLE_SOUND = 1 << 1

const FDS_CTRL_MOTOR_ON                    = 1 << 0
const FDS_CTRL_TRANSFER_RESET              = 1 << 1
const FDS_CTRL_READ                        = 1 << 2
const FDS_CTRL_MIRROR_HORZ                 = 1 << 3
// const FDS_CTRL_CRC_CTRL                    = 1 << 4
// const FDS_CTRL_READ_WRITE_START            = 1 << 6
const FDS_CTRL_ENABLE_IRQ_WHEN_DRIVE_READY = 1 << 7

const DISK_STATUS_TIMER_INTERRUPT     = 1 << 0
const DISK_STATUS_BYTE_TRANSFER       = 1 << 1
const DISK_STATUS_READ_WRITE_ENABLE   = 1 << 7

const DRIVE_STATUS_DISK_NOT_INSERTED = 1 << 0
const DRIVE_STATUS_DISK_NOT_READY    = 1 << 1
const DRIVE_STATUS_DISK_PROTECTED    = 1 << 2

//const EXTERNAL_CONNECTOR_R_BATTERY_GOOD = 1 << 7

// Insert CRC info...
function loadFdsImage(image: Uint8Array): Uint8Array[] {
  const SIDE_LENGTH = 65500
  const sides = image.length / SIDE_LENGTH
  const blocks: [number, number][] = []

  const diskSideImages = new Array<Uint8Array>()
  for (let i = 0; i < sides; ++i) {
    const start = i * SIDE_LENGTH
    blocks.length = 0
    let imageLen = 0
    for (let p = 0; p < SIDE_LENGTH; ) {
      const type = image[p + start]
      let len = -1
      switch (type) {
      case 0x01:  len = 56; break
      case 0x02:  len = 2; break
      case 0x03:  len = 16; break
      case 0x04:  len = 1 + ((image[p - 2 + start] << 8) | image[p - 3 + start]); break
      default: break
      }
      if (len <= 0)
        break

      blocks.push([p + start, len])
      imageLen += len
      p += len
    }

    const totalLen = imageLen + blocks.length * 2 + 1
    const sideImage = new Uint8Array(totalLen)
    let dst = 0
    for (let [p, len] of blocks) {
      for (let j = 0; j < len; ++j)
        sideImage[dst + j] = image[p + j]
      dst += len
      sideImage[dst + 0] = sideImage[dst + 1] = 0x00  // Dummy CRC
      dst += 2
    }
    sideImage[dst - 1] = 0  // End of blocks

    diskSideImages.push(sideImage)
  }

  return diskSideImages
}

export class Mapper020 extends Mapper {
  private ram = new Uint8Array(0xe000 - 0x6000)
  private regs = new Uint8Array(16)
  private nes: Nes
  private diskSideImages = new Array<Uint8Array>()
  private image?: Uint8Array

  private headPointer = 0
  private irqCounter = 0
  private timerIrqOccurred = false
  private transferComplete = false
  private endOfHead = true
  private scanningDisk = false
  //private gapEnded = false
  private delay = 0
  private readData = 0

  public constructor(private biosData: Uint8Array, private options: MapperOptions) {
    super()

    this.options.ppu.setChrData(Uint8Array.from([]))
    this.options.ppu.setMirrorMode(MirrorMode.HORZ)

    // BIOS ROM
    this.options.bus.setReadMemory(0xe000, 0xffff, (adr) => {
      adr = adr | 0
      return this.biosData[adr - 0xe000] | 0
    })

    this.reset()
  }

  public reset() {
    this.headPointer = 0
    this.irqCounter = 0
    this.regs.fill(0)
    this.timerIrqOccurred = false
    this.transferComplete = false
    this.readData = 0
    this.endOfHead = true
    this.scanningDisk = false
    //this.gapEnded = false
    this.delay = 0
  }

  public setUp(nes: Nes) {
    this.nes = nes

    this.options.bus.setReadMemory(0x4000, 0x5fff, (adr) => {  // APU
      if (0x4030 <= adr && adr <= 0x403f)
        return this.readDiskReg(adr)
      return this.nes.readFromApu(adr)
    })
    this.options.bus.setWriteMemory(0x4000, 0x5fff, (adr, value) => {
      if (0x4020 <= adr && adr <= 0x402f)
        return this.writeDiskReg(adr, value)
      this.nes.writeToApu(adr, value)
    })

    // PRG RAM
    this.ram.fill(0xbf)
    this.options.bus.setReadMemory(0x6000, 0xdfff, (adr) => this.ram[adr - 0x6000])
    this.options.bus.setWriteMemory(0x6000, 0xdfff,
                                    (adr, value) => { this.ram[adr - 0x6000] = value })
  }

  public setImage(image: Uint8Array): boolean {
    if (image[0] === 0x46 && image[1] === 0x44 && image[2] === 0x53 && image[3] === 0x1a) {
      // Skip FDS header.
      image = image.slice(16)
    }
    this.diskSideImages = loadFdsImage(image)
    this.image = this.diskSideImages[0]
    return true
  }

  public getSideCount(): number {
    return this.diskSideImages.length
  }

  public onHblank(_hcount: number): void {
    if ((this.regs[IRQ_CTRL] & IRQ_CTRL_ENABLED) !== 0 &&
        (this.regs[MASTER_IO_ENABLE] & MASTER_IO_ENABLE_DISK) !== 0) {
      this.irqCounter -= 185  // TODO: Calculate
      if (this.irqCounter <= 0) {
        this.options.cpu.requestIrq()
        this.timerIrqOccurred = true
console.log(`IRQ!, repeat=${(this.regs[IRQ_CTRL] & IRQ_CTRL_REPEAT) !== 0}, nextCounter=${(this.regs[IRQ_RELOAD_H] << 8) | this.regs[IRQ_RELOAD_L]}`)
        if ((this.regs[IRQ_CTRL] & IRQ_CTRL_REPEAT) !== 0) {
          this.irqCounter = (this.regs[IRQ_RELOAD_H] << 8) | this.regs[IRQ_RELOAD_L]
        } else {
          this.irqCounter = 0
          this.regs[IRQ_CTRL] &= ~IRQ_CTRL_ENABLED
        }
      }
    }

    if (this.image == null || (this.regs[FDS_CTRL] & FDS_CTRL_MOTOR_ON) === 0) {
      this.endOfHead = true
      this.scanningDisk = false
      return
    }

    if ((this.regs[FDS_CTRL] & FDS_CTRL_TRANSFER_RESET) !== 0 && !this.scanningDisk) {
      return
    }

    if (this.endOfHead) {
      this.delay = 50000 / 10000  // ?
      this.endOfHead = false
      this.headPointer = 0
      //this.gapEnded = false
      return
    }

    if (this.delay > 0) {
      --this.delay
    } else {
      this.scanningDisk = true

      let needIrq = (this.regs[FDS_CTRL] & FDS_CTRL_ENABLE_IRQ_WHEN_DRIVE_READY) !== 0

//console.log(`  read from disk: ${Util.hex(this.headPointer, 4)}: ${Util.hex(this.image[this.headPointer])}`)
      const diskData = this.image[this.headPointer]
      //if ((this.regs[FDS_CTRL] & FDS_CTRL_READ_WRITE_START) === 0) {
      //  this.gapEnded = false
      //} else if (diskData !== 0 && !this.gapEnded) {
      //  this.gapEnded = true
      //  needIrq = false
      //}

      //if (this.gapEnded) {
        this.transferComplete = true
        this.readData = diskData
        if (needIrq) {
          this.options.cpu.requestIrq()
        }
      //}

      //++this.headPointer
      //if (this.headPointer >= this.image.length) {
      //  this.regs[FDS_CTRL] &= ~FDS_CTRL_MOTOR_ON
      //} else {
      //  this.delay = 150 //150  // ?
      //}
    }
  }

  public eject() {
    delete this.image
    this.headPointer = 0
  }

  public setSide(side: number) {
    this.image = this.diskSideImages[side % this.diskSideImages.length]
    //this.reset()
  }

  private readDiskReg(adr: Address): Byte {
    const reg = (adr - 0x4030) | 0
//console.log(`read: ${Util.hex(adr, 4)}`)
    switch (reg) {
    case DISK_STATUS:
      {
        let val = 0
        if (this.image) {
          val = DISK_STATUS_READ_WRITE_ENABLE
          if (this.timerIrqOccurred) {
            val |= DISK_STATUS_TIMER_INTERRUPT
            this.timerIrqOccurred = false
          }
          if (this.transferComplete) {
            val |= DISK_STATUS_BYTE_TRANSFER
            this.transferComplete = false
          }
        }
        return val
      }
    case READ_DATA:
//console.log(`READ_DATA: ${Util.hex(this.readData, 2)}, pointer=${Util.hex(this.headPointer, 4)}, CRC=${(this.regs[FDS_CTRL] & FDS_CTRL_CRC_CTRL) !== 0}`)
      {
        let result = 0
        if ((this.regs[FDS_CTRL] & FDS_CTRL_READ) !== 0) {
          //if ((this.regs[FDS_CTRL] & FDS_CTRL_CRC_CTRL) === 0) {
            result = this.readData
            ++this.headPointer

            if (this.headPointer >= (this.image as Uint8Array).length) {
              this.regs[FDS_CTRL] &= ~FDS_CTRL_MOTOR_ON
            }
          //} else {
          //  console.log('CRC')
          //}
        } else {
          console.log('READ_DATA with write')
        }
        this.transferComplete = false
        return result
      }
    case DRIVE_STATUS:
      {
        let val = DRIVE_STATUS_DISK_NOT_INSERTED | DRIVE_STATUS_DISK_NOT_READY | DRIVE_STATUS_DISK_PROTECTED
        if (this.image != null) {
          val = 0
          if (!this.scanningDisk)
            val |= DRIVE_STATUS_DISK_NOT_READY
        }
        return val
      }
    case EXTERNAL_CONNECTOR_R:
      //return EXTERNAL_CONNECTOR_R_BATTERY_GOOD | (this.regs[EXTERNAL_CONNECTOR_W] & 0x7f)
      return this.regs[EXTERNAL_CONNECTOR_W]
    default:
      break
    }
    return 0
  }

  private writeDiskReg(adr: Address, value: Byte): void {
    const reg = (adr - 0x4020) | 0
//console.log(`write: ${Util.hex(adr, 4)} = ${Util.hex(value)}`)
    this.regs[reg] = value

    switch (reg) {
    case IRQ_CTRL:
      //if ((this.regs[MASTER_IO_ENABLE] & MASTER_IO_ENABLE_DISK) !== 0) {
        if ((value & IRQ_CTRL_ENABLED) !== 0) {
          this.irqCounter = (this.regs[IRQ_RELOAD_H] << 8) | this.regs[IRQ_RELOAD_L]
        } else {
          this.irqCounter = 0
          this.timerIrqOccurred = false
        }
      //}
      break
    case MASTER_IO_ENABLE:
      if ((value & MASTER_IO_ENABLE_DISK) === 0) {
        this.irqCounter = 0
        this.timerIrqOccurred = false
      }
      break
    case WRITE_DATA:
      this.transferComplete = false
      break
    case FDS_CTRL:
      this.options.ppu.setMirrorMode(
        (value & FDS_CTRL_MIRROR_HORZ) !== 0 ? MirrorMode.HORZ : MirrorMode.VERT)
      if ((value & FDS_CTRL_MOTOR_ON) === 0) {
        this.endOfHead = true
        this.scanningDisk = false
      }
      break
    default:
      break
    }
  }
}
