import {SoundChannel} from './sound_channel'
import {Reg, DMC_LOOP_ENABLE, DMC_IRQ_ENABLE} from '../../nes/apu'
import {Cartridge} from '../../nes/cartridge'

// ScriptProcessor DMC channel
const SP_DMC_BUFFER_SIZE = 512
const kDmcRateTable = [
  428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54
]

function gcd(m: number, n: number): number {
  if (m < n) {
    const t = m
    m = n
    n = t
  }

  let r: number
  while ((r = m % n) !== 0) {
    m = n
    n = r
  }
  return n
}

export abstract class IDmcChannel extends SoundChannel {
  public abstract setCartridge(cartridge: Cartridge): void
  public abstract setDmcWrite(reg: number, value: number): void
  public abstract changePrgBank(bank: number, page: number): void
}

class SpDmcChannel extends IDmcChannel {
  private node?: ScriptProcessorNode
  private regs = new Uint8Array(4)
  private enabled = false
  private volume = 0
  private sampleStep = 0
  private rateTable: Float32Array
  private rate = 0

  private prgRom: Uint8Array
  private prgBanks = new Int32Array([0, 1, -2, -1])

  private dmaAddress = 0xc000
  private dmaLengthCounter = 1
  private dmaBuffered = false
  private dmaBuffer = 0
  private outActive = false
  private outShifter = 0
  private outDac = 0
  private outBuffer = 0
  private timer = 0

  public constructor(private context: AudioContext, private destination: AudioNode) {
    super()

    const APU_NOISE_HZ = 894887 * 2
    const sampleRate = context.sampleRate
    const g = gcd(APU_NOISE_HZ, sampleRate)
    const multiplier = Math.min(sampleRate / g, 0x7fff) | 0
    this.sampleStep = (APU_NOISE_HZ * multiplier / sampleRate) | 0

    this.rateTable = new Float32Array(kDmcRateTable.map(x => x * multiplier))
    this.rate = this.rateTable[0]
  }

  public setCartridge(cartridge: Cartridge): void {
    this.prgRom = cartridge.prgRom
  }

  public destroy(): void {
    if (this.node != null) {
      this.node.disconnect()
      // this.node = null
    }
  }

  public start(): void {
  }

  public setEnable(enable: boolean): void {
    this.enabled = enable
    if (!enable)
      this.volume = 0
  }

  public setVolume(volume: number): void {
    this.volume = volume
  }

  public changePrgBank(bank: number, page: number): void {
    this.prgBanks[bank] = page
  }

  public setDmcWrite(reg: number, value: number): void {
    if (this.node == null && this.enabled) {
      this.node = this.createNode(this.context, this.destination)
    }

    if (reg >= 4) {
      switch (reg) {
      case 0xff:
        if (value === 0) {
          this.dmaLengthCounter = 0
        } else if (this.dmaLengthCounter <= 0) {
          this.dmaLengthCounter = (this.regs[Reg.SAMPLE_LENGTH] << 4) + 1
          this.dmaAddress = 0xc000 + (this.regs[Reg.SAMPLE_ADDRESS] << 6)
          if (!this.dmaBuffered)
            this.doDma()
        }
        break
      default:
        break
      }
      return
    }

    this.regs[reg] = value
    switch (reg) {
    case Reg.STATUS:
      this.rate = this.rateTable[value & 0x0f]
      break
    case Reg.DIRECT_LOAD:
      this.outDac = value & 0x7f
      break
    case Reg.SAMPLE_ADDRESS:
      break
    case Reg.SAMPLE_LENGTH:
      break
    }
  }

  private createNode(context: AudioContext, destination: AudioNode): ScriptProcessorNode {
    const node = context.createScriptProcessor(SP_DMC_BUFFER_SIZE, 0, 1)
    node.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0)
      this.fillBuffer(output)
    }
    node.connect(destination)
    return node
  }

  private fillBuffer(buffer: Float32Array): void {
    if (this.volume <= 0) {
      buffer.fill(this.outDac * (4.0 / 127))
      return
    }

    const volume = this.volume * (4.0 / 127)
    const sampleStep = this.sampleStep | 0
    const rate = this.rate | 0
    let timer = this.timer | 0
    let value = this.outDac * volume
    for (let i = 0; i < buffer.length; ++i) {
      timer -= sampleStep
      if (timer < 0) {
        do {
          this.clockDac()
          this.clockDma()
          timer += rate
        } while (timer < 0)
        value = this.outDac * volume
      }
      buffer[i] = value
    }
    this.timer = timer
  }

  private clockDac(): boolean {
    if (this.outActive) {
      const n = this.outDac + ((this.outBuffer & 1) << 2) - 2  // +2 or -2
      this.outBuffer >>= 1
      if (0 <= n && n <= 0x7f && n != this.outDac) {
        this.outDac = n
        return true
      }
    }
    return false
  }

  private clockDma(): void {
    if (this.outShifter <= 0) {
      this.outShifter = 8
      this.outActive = this.dmaBuffered
      if (this.outActive) {
        this.dmaBuffered = false
        this.outBuffer = this.dmaBuffer
        if (this.dmaLengthCounter !== 0)
          this.doDma()
      }
    }
    --this.outShifter
  }

  private doDma(): void {
    this.dmaBuffer = this.triggerDma(this.dmaAddress)
    this.dmaAddress = 0x8000 | ((this.dmaAddress + 1) & 0x7fff)
    this.dmaBuffered = true
    this.dmaLengthCounter -= 1
    if (this.dmaLengthCounter <= 0) {
      if (this.regs[Reg.STATUS] & DMC_LOOP_ENABLE) {
        this.dmaLengthCounter = this.regs[Reg.SAMPLE_LENGTH] * 16 + 1
        this.dmaAddress = 0xc000 + this.regs[Reg.SAMPLE_ADDRESS] * 64
      } else if (this.regs[Reg.STATUS] & DMC_IRQ_ENABLE) {
        // this.cpu.do_irq(CPU::IRQ_DMC, this.cpu.current_clock)
      }
    }
  }

  private triggerDma(adr: number): number {
    const prgMask = (this.prgRom.length - 1) | 0
    const bank = (adr - 0x8000) >> 13
    const offset = (adr & ((1 << 13) - 1)) | 0
    const a = ((this.prgBanks[bank] << 13) + offset) & prgMask
    return this.prgRom[a]
  }
}

export function createDmcChannel(context: AudioContext, destination: AudioNode): IDmcChannel {
  return new SpDmcChannel(context, destination)
}
