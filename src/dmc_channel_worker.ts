declare const sampleRate: number

import {DeltaModulationSampler} from './util/audio/delta_modulation_sampler'

class DmcChannelProcessor extends AudioWorkletProcessor {
  private sampler: DeltaModulationSampler
  private stopped = false

  constructor() {
    super()

    this.sampler = new DeltaModulationSampler(sampleRate)

    this.port.onmessage = (ev) => {
      switch (ev.data.action) {
      case 'stop':
        this.stopped = true
        break
      case 'sendPrgRom':
        this.sampler.setPrgRom(ev.data.prgRom)
        break
      case 'changePrgBank':
        {
          const bank = ev.data.value >> 8
          const page = ev.data.value & 0xff
          this.sampler.changePrgBank(bank, page)
        }
        break
      case 'enable':
        this.sampler.setEnable(ev.data.value)
        break
      case 'volume':
        this.sampler.setVolume(ev.data.value)
        break
      case 'dmcWrite':
        {
          const reg = ev.data.value >> 8
          const value = ev.data.value & 0xff
          this.sampler.setDmcWrite(reg, value)
        }
        break
      }
    }
  }

  public process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    if (this.stopped)
      return false

    const output = outputs[0]
    const numberOfChannels = output.length

    let first: Float32Array|null = null
    for (let channel = 0; channel < numberOfChannels; ++channel) {
      const ch = output[channel]
      if (first == null) {
        first = ch
        this.sampler.fillBuffer(ch)
      } else {
        ch.set(first)
      }
    }

    return true
  }
}

registerProcessor('dmc_worklet', DmcChannelProcessor)
