//import {CPU_HZ} from '../nes/const'
//const APU_NOISE_HZ = (CPU_HZ / 2) | 0
const APU_NOISE_HZ = 894887

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

export class NoiseSampler {
  private volume = 0
  private period = -1
  private timer = 0
  private bits = 0x0001  // 15bits

  private rate = 0
  private fixed = 0
  private shift = 1

  constructor(sampleRate: number) {
    const g = gcd(APU_NOISE_HZ, sampleRate)
    const multiplier = Math.min(sampleRate / g, 0x7fff) | 0
    this.rate = (APU_NOISE_HZ * multiplier / sampleRate) | 0
    this.fixed = multiplier | 0
  }

  public setVolume(volume: number): void {
    this.volume = volume
  }

  public setPeriod(period: number, mode: number): void {
    this.period = (period + 1) * this.fixed
    this.shift = mode === 0 ? 1 : 6
  }

  public fillBuffer(buffer: Float32Array): void {
    if (this.volume <= 0) {
      buffer.fill(0)
      return
    }

    const shift = this.shift
    const rate = this.rate | 0
    const period = (this.period > 0 ? this.period : this.rate) | 0
    const volume = this.volume
    let timer = this.timer | 0
    let bits = this.bits | 0
    let v = (1 - (bits & 1)) * volume

    const len = buffer.length
    for (let i = 0; i < len; ++i) {
      timer -= rate
      if (timer < 0) {
        do {
          const x = ((bits ^ (bits >> shift)) & 1) | 0
          bits = ((bits >> 1) | (x << 14)) | 0
          timer += period
        } while (timer < 0)
        v = (1 - (bits & 1)) * volume
      }
      buffer[i] = v
    }
    this.timer = timer
    this.bits = bits
  }
}
