import {SoundChannel} from './sound_channel'
import {Cartridge} from '../../nes/cartridge'
import {DeltaModulationSampler} from './delta_modulation_sampler'

// ScriptProcessor DMC channel
const SP_DMC_BUFFER_SIZE = 512
export abstract class IDmcChannel extends SoundChannel {
  public abstract setCartridge(cartridge: Cartridge): void
  public abstract setDmcWrite(reg: number, value: number): void
  public abstract changePrgBank(bank: number, page: number): void
}

class SpDmcChannel extends IDmcChannel {
  private node?: ScriptProcessorNode
  private enabled = false

  private sampler: DeltaModulationSampler

  public constructor(private context: AudioContext, private destination: AudioNode) {
    super()

    this.sampler = new DeltaModulationSampler(context.sampleRate)
  }

  public setCartridge(cartridge: Cartridge): void {
    this.sampler.setPrgRom(cartridge.prgRom)
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
    this.sampler.setEnable(enable)
  }

  public setVolume(volume: number): void {
    this.sampler.setVolume(volume)
  }

  public changePrgBank(bank: number, page: number): void {
    this.sampler.changePrgBank(bank, page)
  }

  public setDmcWrite(reg: number, value: number): void {
    if (this.node == null && this.enabled) {
      this.node = this.createNode(this.context, this.destination)
    }

    this.sampler.setDmcWrite(reg, value)
  }

  private createNode(context: AudioContext, destination: AudioNode): ScriptProcessorNode {
    const node = context.createScriptProcessor(SP_DMC_BUFFER_SIZE, 0, 1)
    node.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0)
      this.sampler.fillBuffer(output)
    }
    node.connect(destination)
    return node
  }
}

// Audio-worklet DMC channel
const DMC_WORKER_PASS = 'assets/dmc_channel_worker.js'
class AwDmcChannel extends IDmcChannel {
  private node?: AudioWorkletNode
  private prgRom: Uint8Array | null = null

  public static create(context: AudioContext, destination: AudioNode): AwDmcChannel|null {
    if (typeof(AudioWorkletNode) === 'undefined')
      return null
    return new AwDmcChannel(context, destination)
  }

  private constructor(context: AudioContext, destination: AudioNode) {
    super()

    context.audioWorklet.addModule(DMC_WORKER_PASS)
      .then(() => {
        this.node = new AudioWorkletNode(context, 'dmc_worklet')
        this.node.connect(destination)

        if (this.prgRom != null) {
          this.sendPrgRom(this.prgRom)
          this.prgRom = null
        }
      })
      .catch(console.error)
  }

  public destroy(): void {
    if (this.node != null) {
      this.node.port.postMessage({action: 'stop'})
      this.node.disconnect()
      // this.node = null
    }
  }

  public setCartridge(cartridge: Cartridge): void {
    const prgRom = new Uint8Array(cartridge.prgRom)  // Duplicate
    if (this.node != null)
      this.sendPrgRom(prgRom)
    else
      this.prgRom = prgRom
  }

  public setDmcWrite(reg: number, value: number): void {
    if (this.node != null)
      this.node.port.postMessage({action: 'dmcWrite', value: (reg << 8) | value})
  }

  public changePrgBank(bank: number, page: number): void {
    if (this.node != null)
      this.node.port.postMessage({action: 'changePrgBank', value: (bank << 8) | page})
  }

  public start(): void {
  }

  public setEnable(enable: boolean): void {
    if (this.node != null)
      this.node.port.postMessage({action: 'enable', value: enable})
  }

  public setVolume(volume: number): void {
    if (this.node != null)
      this.node.port.postMessage({action: 'volume', value: volume})
  }

  private sendPrgRom(prgRom: Uint8Array): void {
    this.node!.port.postMessage({
      'action': 'sendPrgRom',
      prgRom,
    }, [prgRom.buffer])  // Transferable objects.
  }
}

export function createDmcChannel(context: AudioContext, destination: AudioNode): IDmcChannel {
  return AwDmcChannel.create(context, destination) ||
      new SpDmcChannel(context, destination)
}
