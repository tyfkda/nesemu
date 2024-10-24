import {DeltaModulationSampler} from './delta_modulation_sampler'
import {IDmcChannel} from './sound_channel'
import {ICartridge} from '../../nes/cartridge'

// ScriptProcessor DMC channel
const SP_DMC_BUFFER_SIZE = 512

export class SpDmcChannel extends IDmcChannel {
  private node?: ScriptProcessorNode
  private enabled = false

  private sampler: DeltaModulationSampler

  public constructor(private context: AudioContext, private destination: AudioNode) {
    super()

    this.sampler = new DeltaModulationSampler(context.sampleRate)
  }

  public setCartridge(cartridge: ICartridge): void {
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
