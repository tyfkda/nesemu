import {Mapper, PrgBankController} from './mapper'
import {Cpu} from '../cpu'
import {Ppu} from '../ppu'

export class Mapper003 extends Mapper {
  private chrBank = 0

  public static create(pbc: PrgBankController, size: number, cpu: Cpu, ppu: Ppu): Mapper {
    return new Mapper003(pbc, size, cpu, ppu)
  }

  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, private ppu: Ppu) {
    super()

    // Chr ROM bank
    cpu.setWriteMemory(0x8000, 0xffff, (adr, value) => {
      this.chrBank = value
      this.ppu.setChrBank(this.chrBank)
    })
  }

  public save(): object {
    return {
      chrBank: this.chrBank,
    }
  }

  public load(saveData: any): void {
    this.chrBank = saveData.chrBank
    this.ppu.setChrBank(this.chrBank)
  }
}

export class Mapper185 extends Mapper003  {
  constructor(prgBankCtrl: PrgBankController, prgSize: number, cpu: Cpu, ppu: Ppu) {
    super(prgBankCtrl, prgSize, cpu, ppu)
    ppu.writePpuDirect(0x0000, 1)  // For "Mighty bomb jack(J)"
  }
}
