import {Address, Byte} from '../types'

export default interface IBus {
  read8(adr: Address): Byte
  write8(adr: Address, value: Byte): void
}
