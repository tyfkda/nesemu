import {Address, Byte} from './types'
import {IBus} from './cpu/ibus'
import {Util} from '../util/util'

const BLOCK_SIZE = 0x2000

export type Reader = (adr: Address) => Byte
export type Writer = (adr: Address, value: Byte) => void

export class Bus implements IBus {
  private readerTable = new Array<Reader>(0x10000 / BLOCK_SIZE)
  private writerTable = new Array<Writer>(0x10000 / BLOCK_SIZE)
  private readErrorReported = false
  private writeErrorReported = false

  public constructor() {
    this.clearMemoryMap()
  }

  public clearMemoryMap(): void {
    this.readerTable.fill(adr => {
      if (!this.readErrorReported) {
        console.error(`Illegal read at ${Util.hex(adr, 4)}`)
        this.readErrorReported = true
      }
      return 0xbf  // Returns dummy value (undefined opcode, non plausible value).
    })
    this.writerTable.fill((adr, value) => {
      if (!this.writeErrorReported) {
        const sadr = Util.hex(adr, 4), sv = Util.hex(value, 2)
        console.error(`Illegal write at ${sadr}, ${sv}`)
        this.writeErrorReported = true
      }
    })
  }

  public setReadMemory(start: Address, end: Address, reader: Reader): void {
    start |= 0
    end |= 0
    const startBlock = (start / BLOCK_SIZE) | 0
    const endBlock = (end / BLOCK_SIZE) | 0
    for (let i = startBlock; i <= endBlock; ++i)
      this.readerTable[i] = reader
  }

  public setWriteMemory(start: Address, end: Address, writer: Writer): void {
    start |= 0
    end |= 0
    const startBlock = (start / BLOCK_SIZE) | 0
    const endBlock = (end / BLOCK_SIZE) | 0
    for (let i = startBlock; i <= endBlock; ++i)
      this.writerTable[i] = writer
  }

  public read8(adr: Address): Byte {
    adr |= 0
    const block = (adr / BLOCK_SIZE) | 0
    const reader = this.readerTable[block]
    return reader(adr)
  }

  public write8(adr: Address, value: Byte): void {
    adr |= 0
    const block = (adr / BLOCK_SIZE) | 0
    const writer = this.writerTable[block]
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
