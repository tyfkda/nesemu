// For disk image
// https://wiki.nesdev.com/w/index.php/Family_Computer_Disk_System
// https://wiki.nesdev.com/w/index.php/FDS_BIOS

import {FdsAudio} from './fds_audio'
import {Address, Byte} from '../types'
import {IrqType} from '../cpu/cpu'
import {Mapper, MapperOptions} from '../mapper/mapper'
import {MirrorMode} from '../ppu/types'
import {Util} from '../../util/util'
import {IChannel, WaveType} from '../apu'
import { IBus } from '../cpu/ibus'

export const RAM_SIZE = 0xe000 - 0x6000

const Reg = {
  // $402x: write-only registers
  IRQ_RELOAD_L        : 0,
  IRQ_RELOAD_H        : 1,
  IRQ_CTRL            : 2,
  MASTER_IO_ENABLE    : 3,
  WRITE_DATA          : 4,
  FDS_CTRL            : 5,
  EXTERNAL_CONNECTOR_W: 6,
} as const

const Read = {
  // $403x: read-only registers
  DISK_STATUS         : 0,
  READ_DATA           : 1,
  DRIVE_STATUS        : 2,
  EXTERNAL_CONNECTOR_R: 3,
} as const

const enum IrqCtrl {
  REPEAT  = 1 << 0,
  ENABLED = 1 << 1,
}

const enum MasterIoEnable {
  DISK  = 1 << 0,
  SOUND = 1 << 1,
}

const enum FdsCtrl {
  MOTOR_ON                    = 1 << 0,
  TRANSFER_RESET              = 1 << 1,
  READ                        = 1 << 2,
  MIRROR_HORZ                 = 1 << 3,
  CRC_CTRL                    = 1 << 4,
  READ_WRITE_START            = 1 << 6,
  ENABLE_IRQ_WHEN_DRIVE_READY = 1 << 7,
}

const enum DiskStatus {
  TIMER_INTERRUPT     = 1 << 0,
  BYTE_TRANSFER       = 1 << 1,
  READ_WRITE_ENABLE   = 1 << 7,
}

const enum DriveStatus {
  DISK_NOT_INSERTED = 1 << 0,
  DISK_NOT_READY    = 1 << 1,
  DISK_PROTECTED    = 1 << 2,
}

// const EXTERNAL_CONNECTOR_R_BATTERY_GOOD = 1 << 7

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
    for (const [p, len] of blocks) {
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

export class FdsMapper extends Mapper {
  private ram = new Uint8Array(RAM_SIZE)
  private regs = new Uint8Array(16)
  private diskSideImages = new Array<Uint8Array>()
  private image?: Uint8Array
  private side = 0

  private headPointer = 0
  private irqCounter = 0
  private timerIrqOccurred = false
  private transferComplete = false
  private endOfHead = true
  private scanningDisk = false
  private gapEnded = false
  private delay = 0
  private readData = 0

  private audio = new FdsAudio()

  public constructor(private biosData: Uint8Array, options: MapperOptions, private bus: IBus) {
    super(options)

    this.options.setChrData(Uint8Array.from([]))
    this.options.setMirrorMode(MirrorMode.HORZ)

    // BIOS ROM
    this.options.setReadMemory(0xe000, 0xffff, adr => {
      if (adr === 0xe445) {
        this.detectRequestingSide()
      }

      return this.biosData[adr - 0xe000]
    })

    // PRG RAM
    this.ram.fill(0xbf)
    this.options.setReadMemory(0x6000, 0xdfff, adr => this.ram[adr - 0x6000])
    this.options.setWriteMemory(0x6000, 0xdfff,
                                (adr, value) => this.ram[adr - 0x6000] = value)

    this.reset()
  }

  public reset(): void {
    this.headPointer = 0
    this.irqCounter = 0
    this.regs.fill(0)
    this.timerIrqOccurred = false
    this.transferComplete = false
    this.readData = 0
    this.endOfHead = true
    this.scanningDisk = false
    this.gapEnded = false
    this.delay = 0
  }

  public setImage(image: Uint8Array): boolean {
    if (image[0] === 0x46 && image[1] === 0x44 && image[2] === 0x53 && image[3] === 0x1a) {
      // Skip FDS header.
      image = new Uint8Array(image.buffer, 16)
    }
    this.diskSideImages = loadFdsImage(image)
    this.side = 0
    this.image = this.diskSideImages[this.side]
    return true
  }

  public getSideCount(): number {
    return this.diskSideImages.length
  }

  public onHblank(_hcount: number): void {
    if ((this.regs[Reg.IRQ_CTRL] & IrqCtrl.ENABLED) !== 0 &&
        (this.regs[Reg.MASTER_IO_ENABLE] & MasterIoEnable.DISK) !== 0) {
      this.irqCounter -= 111  // TODO: Calculate
      if (this.irqCounter <= 0) {
        this.options.requestIrq(IrqType.EXTERNAL)
        this.timerIrqOccurred = true
        if ((this.regs[Reg.IRQ_CTRL] & IrqCtrl.REPEAT) !== 0) {
          this.irqCounter = (this.regs[Reg.IRQ_RELOAD_H] << 8) | this.regs[Reg.IRQ_RELOAD_L]
        } else {
          this.irqCounter = 0
          this.regs[Reg.IRQ_CTRL] &= ~IrqCtrl.ENABLED
        }
      }
    }

    if (this.image == null || (this.regs[Reg.FDS_CTRL] & FdsCtrl.MOTOR_ON) === 0) {
      this.endOfHead = true
      this.scanningDisk = false
      return
    }

    if ((this.regs[Reg.FDS_CTRL] & FdsCtrl.TRANSFER_RESET) !== 0 && !this.scanningDisk) {
      return
    }

    if (this.endOfHead) {
      this.delay = 50000 / 10000  // ?
      this.endOfHead = false
      this.headPointer = 0
      this.gapEnded = false
      return
    }

    if (this.delay > 0) {
      --this.delay
    } else {
      this.scanningDisk = true

      let needIrq = (this.regs[Reg.FDS_CTRL] & FdsCtrl.ENABLE_IRQ_WHEN_DRIVE_READY) !== 0

      if ((this.regs[Reg.FDS_CTRL] & FdsCtrl.READ) !== 0) {
        const diskData = this.image[this.headPointer]
        if ((this.regs[Reg.FDS_CTRL] & FdsCtrl.READ_WRITE_START) === 0) {
          this.gapEnded = false
        } else if (diskData !== 0 && !this.gapEnded) {
          this.gapEnded = true
          needIrq = false
        }

        if (this.gapEnded) {
          this.transferComplete = true
          this.readData = diskData
          if (needIrq) {
            ++this.headPointer

            if (this.headPointer >= this.image!.length) {
              this.regs[Reg.FDS_CTRL] &= ~FdsCtrl.MOTOR_ON
            }

            this.options.requestIrq(IrqType.FDS)
          }
        }
      } else {
        if ((this.regs[Reg.FDS_CTRL] & FdsCtrl.CRC_CTRL) === 0) {
          this.transferComplete = true
          if (needIrq) {
            if ((this.regs[Reg.FDS_CTRL] & FdsCtrl.READ_WRITE_START) !== 0) {
              const diskData = this.regs[Reg.WRITE_DATA]
              this.writeDataToDisk(diskData)
            }

            this.options.requestIrq(IrqType.FDS)
          }
        }

        this.gapEnded = false
      }
    }
  }

  public eject(): void {
    delete this.image
    this.headPointer = 0
  }

  public setSide(side: number): void {
    this.image = this.diskSideImages[side % this.diskSideImages.length]
    // this.reset()
  }

  public save(): object {
    return super.save({
      ram: Util.convertUint8ArrayToBase64String(this.ram),
    })
  }

  public load(saveData: any): void {
    super.load(saveData)
    const ram = Util.convertBase64StringToUint8Array(saveData.ram)
    this.ram = ram
  }

  public readDiskReg(adr: Address): Byte {
    const reg = (adr - 0x4030) | 0
    switch (reg) {
    case Read.DISK_STATUS:
      {
        let val = 0
        if (this.image != null) {
          val = DiskStatus.READ_WRITE_ENABLE
          if (this.timerIrqOccurred) {
            val |= DiskStatus.TIMER_INTERRUPT
            this.timerIrqOccurred = false
          }
          if (this.transferComplete) {
            val |= DiskStatus.BYTE_TRANSFER
            this.transferComplete = false
          }
        }
        this.options.clearIrqRequest(IrqType.EXTERNAL)
        this.options.clearIrqRequest(IrqType.FDS)
        return val
      }
    case Read.READ_DATA:
if (this.headPointer === 0) {
  console.log(`READ_DATA: 0`)
}
      {
        const result = this.readData
        this.transferComplete = false
        this.options.clearIrqRequest(IrqType.FDS)
        return result
      }
    case Read.DRIVE_STATUS:
      {
        let val = (DriveStatus.DISK_NOT_INSERTED | DriveStatus.DISK_NOT_READY |
                   DriveStatus.DISK_PROTECTED)
        if (this.image != null) {
          val = 0
          if (!this.scanningDisk)
            val |= DriveStatus.DISK_NOT_READY
        }
        return val
      }
    case Read.EXTERNAL_CONNECTOR_R:
      return this.regs[Reg.EXTERNAL_CONNECTOR_W]
    default:
      break
    }
    return 0
  }

  public writeDiskReg(adr: Address, value: Byte): void {
    const reg = (adr - 0x4020) | 0
    this.regs[reg] = value

    switch (reg) {
    case Reg.IRQ_CTRL:
      if ((value & IrqCtrl.ENABLED) !== 0) {
        this.irqCounter = (this.regs[Reg.IRQ_RELOAD_H] << 8) | this.regs[Reg.IRQ_RELOAD_L]
      } else {
        this.irqCounter = 0
        this.timerIrqOccurred = false
        this.options.clearIrqRequest(IrqType.EXTERNAL)
      }
      break
    case Reg.MASTER_IO_ENABLE:
      if ((value & MasterIoEnable.DISK) === 0) {
        this.irqCounter = 0
        this.timerIrqOccurred = false
        this.options.clearIrqRequest(IrqType.EXTERNAL)
        this.options.clearIrqRequest(IrqType.FDS)
      }
      break
    case Reg.WRITE_DATA:
      this.transferComplete = false
      this.options.clearIrqRequest(IrqType.FDS)
      break
    case Reg.FDS_CTRL:
      this.options.setMirrorMode(
        (value & FdsCtrl.MIRROR_HORZ) !== 0 ? MirrorMode.HORZ : MirrorMode.VERT)
      if ((value & FdsCtrl.MOTOR_ON) === 0) {
        this.endOfHead = true
        this.scanningDisk = false
      }
      this.options.clearIrqRequest(IrqType.FDS)
      break
    default:
      break
    }
  }

  public getExtraChannelWaveTypes(): WaveType[]|null {
    return this.audio.getExtraChannelWaveTypes()
  }

  public getSoundChannel(ch: number): IChannel {
    return this.audio.getSoundChannel(ch)
  }

  public readAudio(adr: Address): Byte {
    return this.isSoundEnable() ? this.audio.read(adr) : 0x00
  }

  public writeAudio(adr: Address, value: Byte): void {
    if (this.isSoundEnable())
      this.audio.write(adr, value)
  }

  private isSoundEnable(): boolean {
    return (this.regs[Reg.MASTER_IO_ENABLE] & MasterIoEnable.SOUND) !== 0
  }

  private writeDataToDisk(data: Byte): void {
    if (this.headPointer < 2 || this.headPointer >= this.image!.length) {
      console.error(`Illegal disk write: out of head range: ${this.headPointer}`)
    } else {
      this.image![this.headPointer - 2] = data
    }

    ++this.headPointer
    if (this.headPointer >= this.image!.length) {
      this.regs[Reg.FDS_CTRL] &= ~FdsCtrl.MOTOR_ON
    }
  }

  private detectRequestingSide() {
    const bufferAddr = this.bus.read8(0) | (this.bus.read8(1) << 8)
console.log(`Read 0xe445: (0x00)=${Util.hex(bufferAddr, 4)}`)
    const buffer = new Uint8Array(10)
    for (let i = 0; i < 10; ++i) {
      if (bufferAddr + i !== 0xe445) {
        buffer[i] = this.bus.read8(bufferAddr + i)
      } else {
        buffer[i] = 0
      }
    }
console.log(Array.from(buffer).map(x => Util.hex(x, 2)).join(' '))

    const OFFSET = 15
    let matchCount = 0
    let matchedSide = -1
    for (let i = 0; i < this.diskSideImages.length; ++i) {
      const header = this.diskSideImages[i]
      let match = true
console.log(`${i}: ${Array.from(Array(buffer.length).keys()).map(j => Util.hex(header[j + 15]))}`)
      for (let j = 0; j < buffer.length; ++j) {
        if (buffer[j] !== header[j + OFFSET] && buffer[j] !== 0xff) {
          match = false
          break
        }
      }
      if (match) {
        ++matchCount
        matchedSide = i
      }
    }
console.log(`Match: #${matchCount}, ${matchedSide}`)
    // if (matchCount === 1) {
    // }
  }
}
