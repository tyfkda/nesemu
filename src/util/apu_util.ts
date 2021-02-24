const CLK_M2_MUL   = 6
const CLK_NTSC     = 39_375_000 * CLK_M2_MUL
const CLK_NTSC_DIV = 11

const RP2A03_CC = 12
const CPU_CLK_1 = RP2A03_CC

export class NoiseSampler {
  private volume = 0
  private frequency = -1
  private timer = 0
  private bits = 0x0001  // 15bits

  private rate = 0
  private fixed = 0

  constructor(sampleRate: number) {
    let multiplier = 0
    for (; ++multiplier < 0x1000; ) {
      if ((CLK_NTSC * (multiplier + 1) / sampleRate > 0x7ffff) ||
          (CLK_NTSC * multiplier % sampleRate == 0))
        break
    }

    this.rate = CLK_NTSC * multiplier / sampleRate
    this.fixed = CLK_NTSC_DIV * CPU_CLK_1 * multiplier
  }

  public setVolume(volume: number): void {
    this.volume = volume
  }

  public setFrequency(frequency: number): void {
    this.frequency = frequency * this.fixed
  }

  public fillBuffer(buffer: Float32Array): void {
    if (this.volume <= 0) {
      buffer.fill(0)
      return
    }

    const shift = 1
    const rate = this.rate | 0
    const freq = (this.frequency > 0 ? this.frequency : this.fixed) | 0
    const volume = this.volume
    let timer = this.timer | 0
    let bits = this.bits | 0
    let b = 1 - (bits & 1)
    let v = b * volume

    const len = buffer.length
    for (let i = 0; i < len; ++i) {
      if (timer >= rate) {
        buffer[i] = v
        timer -= rate
      } else {
        let sum = (timer * b) | 0
        timer -= rate
        do {
          const x = ((bits ^ (bits >> shift)) & 1) | 0
          bits = ((bits >> 1) | (x << 14)) | 0
          b = (1 - (bits & 1)) | 0
          sum += (Math.min(-timer, freq) * b) | 0
          timer += freq
        } while (timer < 0)
        buffer[i] = sum >= (rate >> 1) ? volume : 0
        v = b * volume
      }
    }
    this.timer = timer
    this.bits = bits
  }
}
