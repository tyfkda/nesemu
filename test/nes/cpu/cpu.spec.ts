import {Cpu} from '../../../src/nes/cpu/cpu'
import {Bus} from '../../../src/nes/bus'
import {Address, Byte} from '../../../src/nes/types'

class MappedBus extends Bus {
  constructor(m: {[key: number]: Byte}) {
    super()
    this.setReadMemory(0x8000, 0xffff, (adr: Address) => m[adr])
    this.setWriteMemory(0x8000, 0xffff, (adr: Address, value: Byte) => { m[adr] = value })
  }
}

//class MockedBus extends Bus {
//  constructor(reader: (adr: Address) => Byte,
//              writer: (adr: Address, value: Byte) => void) {
//    super()
//    this.setReadMemory(0x8000, 0xffff, (adr: Address) => reader(adr))
//    this.setWriteMemory(0x8000, 0xffff, (adr: Address, value: Byte) => { writer(adr, value) })
//  }
//}

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
