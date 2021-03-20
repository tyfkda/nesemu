import {Address, Byte} from '../types'

export interface IBus {
  read8(adr: Address): Byte
  write8(adr: Address, value: Byte): void
}
