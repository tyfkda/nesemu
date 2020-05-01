import Cpu, {IrqType} from '../../../src/nes/cpu/cpu'
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

  it('NMI', () => {
    const cpu = new Cpu(new MappedBus({
      0xfffa: 0x76,
      0xfffb: 0x98,
      0xfffc: 0xcd,
      0xfffd: 0xab,
    }))
    cpu.reset()
    cpu.nmi()
    expect(cpu.getRegs().pc).toBe(0x9876)
  })

  it('IRQ', () => {
    const cpu = new Cpu(new MappedBus({
      0x8000: 0x58,  // CLI
      0x8001: 0xea,  // NOP
      0xc000: 0xea,  // NOP

      0xfffc: 0x00,
      0xfffd: 0x80,
      0xfffe: 0x00,
      0xffff: 0xc0,
    }))
    cpu.reset()
    cpu.step()  // CLI
    cpu.requestIrq(IrqType.EXTERNAL)
    cpu.step()
    expect(cpu.getRegs().pc).toBe(0xc001)
  })
})
