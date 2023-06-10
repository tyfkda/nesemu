// VRC6
// http://wiki.nesdev.com/w/index.php/VRC6

import {Channel, IPulseChannel, WaveType} from '../../nes/apu'
import {IrqType} from '../cpu/cpu'
import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'
import {Util} from '../../util/util'
import {CPU_HZ, VBlank} from '../const'

const IRQ_ENABLE_AFTER = 1 << 0
const IRQ_ENABLE = 1 << 1
const IRQ_MODE = 1 << 2

const CH_ENABLE = 1 << 7

const FREQCTL_HALT = 1 << 0
const FREQCTL_16X  = 1 << 1
const FREQCTL_256X = 1 << 2

const kMirrorTable = [MirrorMode.VERT, MirrorMode.HORZ, MirrorMode.SINGLE0, MirrorMode.SINGLE1]

const kChrBankTable = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [0, 0, 1, 1, 2, 2, 3, 3],
  [0, 1, 2, 3, 4, 4, 5, 5],
  [0, 1, 2, 3, 4, 4, 5, 5],
]

const kWaveTypes: WaveType[] = [
  WaveType.PULSE,
  WaveType.PULSE,
  WaveType.SAWTOOTH,
]

abstract class VrcChannel extends Channel {
  halt = false
  frequencyScaling = 0
}

class VrcPulseChannel extends VrcChannel implements IPulseChannel {
  public getVolume(): number {
    if (this.halt || !this.enabled)
      return 0
    return (this.regs[0] & 15) / (15 * 2)
  }

  public getFrequency(): number {
    const f = this.regs[1] | ((this.regs[2] & 0x0f) << 8)
    return (CPU_HZ / 16) / (f + 1) * this.frequencyScaling
  }

  public getDutyRatio(): number {
    if (this.regs[0] & 0x80)
      return 1
    else
      return (((this.regs[0] >> 4) & 7) + 1) / 8
  }
}

class SawToothChannel extends VrcChannel {
  private acc = 0
  private count = 0

  public write(reg: number, value: number): void {
    super.write(reg, value)
    switch (reg) {
    case 2:
      this.count = 0
      if ((value & CH_ENABLE) === 0) {
        this.acc = 0
      }
      break
    }
  }

  public update(): void {
    if (this.enabled) {
      this.acc += this.regs[0] & 0x3f
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
    if (this.halt || !this.enabled)
      return 0
    // TODO: Use distorted wave.
    return Math.min((this.regs[0] & 0x3f) * (6 / 255), 1)
  }

  public getFrequency(): number {
    const f = this.regs[1] | ((this.regs[2] & 0x0f) << 8)
    return (CPU_HZ / 14) / (f + 1) * this.frequencyScaling
  }
}

class Mapper024Base extends Mapper {
  private chrRegs = new Uint8Array(8)
  private prgCount = 0
  private prgBank = 0
  private ppuBankMode = 0
  private mirrorMode = 0
  private irqControl = 0
  private irqLatch = 0
  private irqCounter = 0

  private channels = new Array<VrcChannel>(kWaveTypes.length)

  constructor(private options: MapperOptions, mapping: Record<number, number>) {
    super()

    this.sram = new Uint8Array(0x2000)

    const BANK_BIT = 13
    this.prgCount = options.cartridge!.prgRom.byteLength >> BANK_BIT
    this.options.setPrgBank(0, 0)
    this.options.setPrgBank(1, 1)
    this.setPrgBank(this.prgCount - 2)

    // PRG ROM bank
    this.options.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
      if (0x8000 <= adr && adr <= 0x8003) {
        this.setPrgBank((value & (this.prgCount / 2 - 1)) << 1)
      } else if (0x9000 <= adr && adr <= 0x9002) {
        this.writeSound(0, adr & 3, value)
      } else if (adr === 0x9003) {
        const halt = (value & FREQCTL_HALT) !== 0
        const scale: number =
            ((value & FREQCTL_256X) !== 0) ? 256 :
            ((value & FREQCTL_16X) !== 0) ? 16 : 1
        for (const channel of this.channels) {
          channel.halt = halt
          channel.frequencyScaling = scale
        }
      }
    })
    this.options.setWriteMemory(0xc000, 0xdfff, (adr, value) => {
      if (0xc000 <= adr && adr <= 0xc003) {
        this.options.setPrgBank(2, value)
      }
    })

    // CHR ROM bank
    const b003 = 0xb000 | mapping[3]
    this.options.setWriteMemory(0xa000, 0xbfff, (adr, value) => {
      if ((adr & 0xf0ff) === b003) {
        this.ppuBankMode = value & 3
        this.setChrBank()

        this.mirrorMode = (value >> 2) & 3
        this.options.setMirrorMode(kMirrorTable[this.mirrorMode])
      } else if (0xa000 <= adr && adr <= 0xa002) {
        this.writeSound(1, adr & 3, value)
      } else if (0xb000 <= adr && adr <= 0xb002) {
        this.writeSound(2, adr & 3, value)
      }
    })
    this.options.setWriteMemory(0xd000, 0xffff, (adr, value) => {
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
          this.options.clearIrqRequest(IrqType.EXTERNAL)
          break
        case 2:  // IRQ Acknowledge
          {
            // Copy to enable
            const ea = this.irqControl & IRQ_ENABLE_AFTER
            this.irqControl = (this.irqControl & ~IRQ_ENABLE) | (ea << 1)
          }
          break
        default:
          break
        }
      }
    })

    // PRG RAM
    this.sram.fill(0xff)
    this.options.setReadMemory(0x6000, 0x7fff, adr => this.sram[adr & 0x1fff])
    this.options.setWriteMemory(0x6000, 0x7fff,
                                    (adr, value) => { this.sram[adr & 0x1fff] = value })

    this.setupAudio()
  }

  public reset(): void {
    this.irqControl = 0
    this.irqLatch = this.irqCounter = 0
  }

  public save(): object {
    return {
      ram: Util.convertUint8ArrayToBase64String(this.sram),
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
    this.sram = Util.convertBase64StringToUint8Array(saveData.ram)
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
        this.options.requestIrq(IrqType.EXTERNAL)
      }
      this.irqCounter = c
    }

    if (hcount === VBlank.NMI)
      this.updateSound()
  }

  public getExtraChannelWaveTypes(): WaveType[]|null {
    return kWaveTypes
  }

  public getSoundChannel(ch: number): Channel {
    return this.channels[ch]
  }

  private setPrgBank(prgBank: number): void {
    this.prgBank = prgBank
    this.options.setPrgBank(0, prgBank)
    this.options.setPrgBank(1, prgBank + 1)
  }

  private setChrBank(): void {
    const table = kChrBankTable[this.ppuBankMode]
    for (let i = 0; i < 8; ++i)
      this.options.setChrBankOffset(i, this.chrRegs[table[i]])
  }

  private writeSound(ch: number, reg: number, value: number) {
    const channel = this.channels[ch]
    if (reg === 2)
      channel.setEnable((value & CH_ENABLE) !== 0)
    channel.write(reg, value)
  }

  private setupAudio(): void {
    for (let i = 0; i < this.channels.length; ++i) {
      const type = kWaveTypes[i]
      let channel: VrcChannel
      switch (type) {
      case WaveType.PULSE:
        channel = new VrcPulseChannel()
        break
      case WaveType.SAWTOOTH:
        channel = new SawToothChannel()
        break
      default:
        continue
      }
      this.channels[i] = channel
    }
  }

  private updateSound(): void {
    for (const channel of this.channels) {
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
