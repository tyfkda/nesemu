import Cpu from '../../../src/nes/cpu/cpu'
import IBus from '../../../src/nes/cpu/ibus'
import {Address, Byte} from '../../../src/nes/types'

class MappedBus implements IBus {
  constructor(private m: {[key: number]: Byte}) {
  }

  public read8(adr: Address): Byte {
    return this.m[adr]
  }

  public write8(adr: Address, value: Byte): void {
    this.m[adr] = value
  }
}

describe('cpu', () => {
  it('resets PC from VECTOR', () => {
    const cpu = new Cpu(new MappedBus({
      0xfffc: 0xcd,
      0xfffd: 0xab,
    }))
    cpu.reset()
    expect(cpu.getRegs().pc).toBe(0xabcd)
  })
})
