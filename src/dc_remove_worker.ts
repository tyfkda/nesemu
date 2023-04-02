class DcRemoveProcessor extends AudioWorkletProcessor {
  private stopped = false
  private dc: Float32Array = new Float32Array()

  constructor() {
    super()

    this.port.onmessage = (ev) => {
      switch (ev.data.action) {
      case 'stop':
        this.stopped = true
        break
      }
    }
  }

  public process(inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    if (this.stopped)
      return false

    const output = outputs[0]
    const numberOfChannels = output.length
    const input = inputs[0]
    if (this.dc.length !== numberOfChannels) {
      this.dc = new Float32Array(numberOfChannels)
      this.dc.fill(0)
    }

    for (let channel = 0; channel < numberOfChannels; ++channel) {
      const inCh = input[channel]
      if (inCh == null) {
        this.dc[channel] = 0
        continue
      }

      let dc = this.dc[channel]
      const sum = input[0].reduce((acc, val) => acc + val, 0.0)
      dc += (sum / input[0].length - dc) * (1.0 / 32)
      this.dc[channel] = dc

      const outCh = output[channel]
      for (let i = 0, len = inCh.length; i < len; ++i)
        outCh[i] = inCh[i] - dc
    }

    return true
  }
}

registerProcessor('dc_remove_worklet', DcRemoveProcessor)
