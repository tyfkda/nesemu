import {Address, Byte} from './types'
import Util from '../util/util'

const BLOCK_SIZE = 0x2000

export class Bus {
  private readerFuncTable = new Array<(adr: Address) => Byte>(0x10000 / BLOCK_SIZE)
  private writerFuncTable = new Array<(adr: Address, value: Byte) => void>(0x10000 / BLOCK_SIZE)
  private readErrorReported = false
  private writeErrorReported = false

  public constructor() {
    this.clearMemoryMap()
  }

  public clearMemoryMap(): void {
    this.readerFuncTable.fill(_adr => 0xff)
    this.writerFuncTable.fill((_adr, _value) => {})
  }

  public setReadMemory(start: Address, end: Address, func: (adr: Address) => Byte): void {
    const startBlock = (start / BLOCK_SIZE) | 0
    const endBlock = (end / BLOCK_SIZE) | 0
    for (let i = startBlock; i <= endBlock; ++i)
      this.readerFuncTable[i] = func
  }

  public setWriteMemory(start: Address, end: Address,
                        func: (adr: Address, value: Byte) => void): void {
    const startBlock = (start / BLOCK_SIZE) | 0
    const endBlock = (end / BLOCK_SIZE) | 0
    for (let i = startBlock; i <= endBlock; ++i)
      this.writerFuncTable[i] = func
  }

  public read8(adr: Address): Byte {
    const block = (adr / BLOCK_SIZE) | 0
    const reader = this.readerFuncTable[block]
    if (!reader) {
      if (!this.readErrorReported) {
        console.error(`Illegal read at ${Util.hex(adr, 4)}`)
        this.readErrorReported = true
      }
      return 0xbf  // Returns dummy value (undefined opcode, non plausible value).
    }
    return reader(adr)
  }

  public write8(adr: Address, value: Byte): void {
    const block = (adr / BLOCK_SIZE) | 0
    const writer = this.writerFuncTable[block]
    if (!writer) {
      if (!this.writeErrorReported) {
        const sadr = Util.hex(adr, 4), sv = Util.hex(value, 2)
        console.error(`Illegal write at ${sadr}, ${sv}`)
        this.writeErrorReported = true
      }
      return
    }
    return writer(adr, value)
  }

  public dump(start: Address, count: number): void {
    const mem = new Array<Byte>()
    for (let i = 0; i < count; ++i) {
      mem.push(this.read8(i + start))
    }

    for (let i = 0; i < count; i += 16) {
      const line = mem.splice(0, 16).map(x => Util.hex(x, 2)).join(' ')
      console.log(`${Util.hex(start + i, 4)}: ${line}`)
    }
  }
}
