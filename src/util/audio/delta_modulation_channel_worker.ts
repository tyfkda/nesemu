import {ICartridge} from '../../nes/cartridge'
import {IDmcChannel} from './sound_channel'
import DmcWorkletURL from '../../dmc_channel_worker.ts?worker&url'

// Audio-worklet DMC channel
export class AwDmcChannel extends IDmcChannel {
  private node?: AudioWorkletNode
  private prgRom: Uint8Array | null = null

  public static create(context: AudioContext, destination: AudioNode): AwDmcChannel|null {
    if (typeof(AudioWorkletNode) === 'undefined')
      return null
    return new AwDmcChannel(context, destination)
  }

  private constructor(context: AudioContext, destination: AudioNode) {
    super()

    context.audioWorklet.addModule(DmcWorkletURL)
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

  public setCartridge(cartridge: ICartridge): void {
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
