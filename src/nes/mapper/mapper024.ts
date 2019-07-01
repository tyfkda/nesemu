// VRC6
// http://wiki.nesdev.com/w/index.php/VRC6

import {ChannelType} from '../../nes/apu'
import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'
import Util from '../../util/util'

const IRQ_ENABLE_AFTER = 1 << 0
const IRQ_ENABLE = 1 << 1
const IRQ_MODE = 1 << 2

const CPU_CLOCK = 1789773  // Hz
const VBLANK_START = 241

const kMirrorTable = [MirrorMode.VERT, MirrorMode.HORZ, MirrorMode.SINGLE0, MirrorMode.SINGLE1]

const kChrBankTable = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [0, 0, 1, 1, 2, 2, 3, 3],
  [0, 1, 2, 3, 4, 4, 5, 5],
  [0, 1, 2, 3, 4, 4, 5, 5],
]

const kChannelTypes: ChannelType[] = [
  ChannelType.PULSE,
  ChannelType.PULSE,
  ChannelType.SAWTOOTH,
]

class Channel {
  protected regs = new Array<number>(4)

  public write(reg: number, value: number) {
    this.regs[reg] = value
  }

  public update() {}
  public getVolume(): number { return 0 }
  public getFrequency(): number { return 0 }
}

class PulseChannel extends Channel {
  public getVolume(): number {
    if ((this.regs[2] & 0x80) === 0)
      return 0
    return (this.regs[0] & 15) / 15
  }

  public getFrequency(): number {
    const f = this.regs[1] | ((this.regs[2] & 0x0f) << 8)
    return ((CPU_CLOCK / 16) / (f + 1)) | 0
  }
}

class SawToothChannel extends Channel {
  private acc = 0
  private count = 0

  public write(reg: number, value: number) {
    super.write(reg, value)
    switch (reg) {
    case 2:
      this.count = 0
      if ((value & 0x80) === 0) {
        this.acc = 0
      }
      break
    }
  }

  public update() {
    if ((this.regs[2] & 0x80) !== 0) {
      this.acc += (this.regs[0] & 0x3f) * 2
      if (this.acc >= 256) {
        this.acc -= 256
        this.count = 0
      }

      ++this.count
      if (this.count >= 7) {
        this.acc = 0
        this.count = 0
      }
    } else {
      this.acc = 0
    }
  }

  public getVolume(): number {
    if ((this.regs[2] & 0x80) === 0)
      return 0
    // return (this.acc >> (8 - 3)) / 0x1f
    return 1
  }

  public getFrequency(): number {
    const f = this.regs[1] | ((this.regs[2] & 0x0f) << 8)
    return ((CPU_CLOCK / 14) / (f + 1)) | 0
  }
}

class Mapper024Base extends Mapper {
  private ram = new Uint8Array(0x2000)
  private chrRegs = new Uint8Array(8)
  private prgCount = 0
  private prgBank = 0
  private ppuBankMode = 0
  private mirrorMode = 0
  private irqControl: number = 0
  private irqLatch: number = 0
  private irqCounter: number = 0

  private channels: Channel[] = new Array<Channel>(kChannelTypes.length)
  private frequencyScaling = 0

  constructor(private options: MapperOptions, mapping: {[key: number]: number}) {
    super()

    const BANK_BIT = 13
    this.prgCount = options.prgSize >> BANK_BIT
    this.options.prgBankCtrl.setPrgBank(0, 0)
    this.options.prgBankCtrl.setPrgBank(1, 1)
    this.setPrgBank(this.prgCount - 2)

    // PRG ROM bank
    this.options.bus.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (0x8000 <= adr && adr <= 0x8003) {
        this.setPrgBank((value & (this.prgCount / 2 - 1)) << 1)
      } else if (0x9000 <= adr && adr <= 0x9002) {
        this.writeSound(0, adr & 3, value)
      } else if (adr === 0x9003) {
        this.frequencyScaling = value
      }
    })
    this.options.bus.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if (0xc000 <= adr && adr <= 0xc003) {
        this.options.prgBankCtrl.setPrgBank(2, value)
      }
    })

    // CHR ROM bank
    const b003 = 0xb000 | mapping[3]
    this.options.bus.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if ((adr & 0xf0ff) === b003) {
        this.ppuBankMode = value & 3
        this.setChrBank()

        this.mirrorMode = (value >> 2) & 3
        this.options.ppu.setMirrorMode(kMirrorTable[this.mirrorMode])
      } else if (0xa000 <= adr && adr <= 0xa002) {
        this.writeSound(1, adr & 3, value)
      } else if (0xb000 <= adr && adr <= 0xb002) {
        this.writeSound(2, adr & 3, value)
      }
    })
    this.options.bus.setWriteMemory(0xd000, 0xffff, (adr, value) => {
      if (0xd000 <= adr && adr <= 0xefff) {
        const high = ((adr - 0xd000) >> 10) & 4
        const low = adr & 0x0f
        if (low < 4) {
          const reg = mapping[low] + high
          this.chrRegs[reg] = value
          this.setChrBank()
        }
      } else {
        const low = adr & 0xff
        switch (low) {
        case 0:  // IRQ Latch: low 4 bits
          this.irqLatch = value
          break
        case 1:  // IRQ Control
          this.irqControl = value
          if ((this.irqControl & IRQ_ENABLE) !== 0) {
            this.irqCounter = this.irqLatch
          }
          break
        case 2:  // IRQ Acknowledge
          // Copy to enable
          const ea = this.irqControl & IRQ_ENABLE_AFTER
          this.irqControl = (this.irqControl & ~IRQ_ENABLE) | (ea << 1)
          break
        default:
          break
        }
      }
    })

    // PRG RAM
    this.ram.fill(0xff)
    this.options.bus.setReadMemory(0x6000, 0x7fff, (adr) => this.ram[adr & 0x1fff])
    this.options.bus.setWriteMemory(0x6000, 0x7fff,
                                    (adr, value) => { this.ram[adr & 0x1fff] = value })

    this.setupAudio()
  }

  public reset() {
    this.irqControl = 0
    this.irqLatch = this.irqCounter = 0
  }

  public save(): object {
    return {
      ram: Util.convertUint8ArrayToBase64String(this.ram),
      chrRegs: Util.convertUint8ArrayToBase64String(this.chrRegs),
      prgCount: this.prgCount,
      prgBank: this.prgBank,
      ppuBankMode: this.ppuBankMode,
      mirrorMode: this.mirrorMode,
      irqControl: this.irqControl,
      irqLatch: this.irqLatch,
      irqCounter: this.irqCounter,
    }
  }

  public load(saveData: any): void {
    this.ram = Util.convertBase64StringToUint8Array(saveData.ram)
    this.chrRegs = Util.convertBase64StringToUint8Array(saveData.chrRegs)
    this.prgCount = saveData.prgCount
    // this.prgBank = saveData.prgBank
    this.ppuBankMode = saveData.ppuBankMode
    this.mirrorMode = saveData.mirrorMode
    this.irqControl = saveData.irqControl
    this.irqLatch = saveData.irqLatch
    this.irqCounter = saveData.irqCounter

    this.setPrgBank(saveData.prgBank)
    this.setChrBank()
  }

  public onHblank(hcount: number): void {
    if ((this.irqControl & IRQ_ENABLE) !== 0) {
      let c = this.irqCounter
      if ((this.irqControl & IRQ_MODE) === 0) {  // scanline mode
        c += 1
      } else {  // cycle mode
        c += 185  // TODO: Calculate.
      }
      if (c >= 255) {
        c = this.irqLatch
        this.options.cpu.requestIrq()
      }
      this.irqCounter = c
    }

    if (hcount === VBLANK_START)
      this.updateSound()
  }

  public getExtraSoundChannelTypes(): ChannelType[] {
    return kChannelTypes
  }

  public getSoundVolume(channel: number): number {
    const halt = (this.frequencyScaling & 0x01) !== 0
    if (halt)
      return 0
    return this.channels[channel].getVolume()
  }

  public getSoundFrequency(channel: number): number {
    let f = this.channels[channel].getFrequency()
    if ((this.frequencyScaling & 0x02) !== 0)
      f *= 16
    if ((this.frequencyScaling & 0x04) !== 0)
      f *= 256
    return f
  }

  private setPrgBank(prgBank: number) {
    this.prgBank = prgBank
    this.options.prgBankCtrl.setPrgBank(0, prgBank)
    this.options.prgBankCtrl.setPrgBank(1, prgBank + 1)
  }

  private setChrBank() {
    const table = kChrBankTable[this.ppuBankMode]
    for (let i = 0; i < 8; ++i)
      this.options.ppu.setChrBankOffset(i, this.chrRegs[table[i]])
  }

  private writeSound(channel: number, reg: number, value: number) {
    this.channels[channel].write(reg, value)
  }

  private setupAudio() {
    for (let i = 0; i < this.channels.length; ++i) {
      const type = kChannelTypes[i]
      let channel: Channel
      switch (type) {
      case ChannelType.PULSE:
        channel = new PulseChannel()
        break
      case ChannelType.SAWTOOTH:
        channel = new SawToothChannel()
        break
      default:
        continue
      }
      this.channels[i] = channel
    }
  }

  private updateSound() {
    for (let channel of this.channels) {
      channel.update()
    }
  }
}

export class Mapper024 extends Mapper024Base {
  public static create(options: MapperOptions): Mapper {
    return new Mapper024(options)
  }

  constructor(options: MapperOptions) {
    super(options, {
      0: 0,
      1: 1,
      2: 2,
      3: 3,
    })
  }
}

export class Mapper026 extends Mapper024Base {
  public static create(options: MapperOptions): Mapper {
    return new Mapper026(options)
  }

  constructor(options: MapperOptions) {
    super(options, {
      0: 0,
      1: 2,
      2: 1,
      3: 3,
    })
  }
}
