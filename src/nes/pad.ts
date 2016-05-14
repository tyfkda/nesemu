
export enum PadBit {
  A = 1 << 0,
  B = 1 << 1,
  SELECT = 1 << 2,
  START = 1 << 3,
  U = 1 << 4,
  D = 1 << 5,
  L = 1 << 6,
  R = 1 << 7,
}

export class Pad {
  private status: number[] = new Array(2)
  private tmp: number[] = new Array(2)

  public setStatus(no: number, status: number): void {
    this.status[no] = status
  }

  public latch(): void {
    this.tmp[0] = this.status[0]
    this.tmp[1] = this.status[1]
  }

  public shift(no: number): number {
    const result = this.tmp[no] & 1
    this.tmp[no] >>= 1
    return result
  }
}
