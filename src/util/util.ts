export default class Util {
  public static hex(x: number, order: number = 2): string {
    const s = x.toString(16)
    const dif = s.length - order
    if (dif > 0)
      return s.substring(dif)
    if (dif === 0)
      return s
    const zeros = '0000000'
    return zeros.substring(zeros.length + dif) + s
  }

  public static clamp(x: number, min: number, max: number): number {
    return x < min ? min : x > max ? max : x
  }
}
