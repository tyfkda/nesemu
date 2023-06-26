import {Mapper020} from './mapper020'
import {Nes} from '../nes'

// Famicom Disk System
export class Fds {
  private mapper: Mapper020

  constructor(biosData: Uint8Array, private nes: Nes) {
    const bus = this.nes.getBus()
    const cpu = this.nes.getCpu()
    const ppu = this.nes.getPpu()
    this.mapper = new Mapper020(biosData, {
      cartridge: null,
      setReadMemory: bus.setReadMemory.bind(bus),
      setWriteMemory: bus.setWriteMemory.bind(bus),
      setPrgBank: (_bank: number, _page: number): void => { /* Dummy */ },
      requestIrq: cpu.requestIrq.bind(cpu),
      clearIrqRequest: cpu.clearIrqRequest.bind(cpu),
      setChrBank: ppu.setChrBank.bind(ppu),
      setChrBankOffset: ppu.setChrBankOffset.bind(ppu),
      setMirrorMode: ppu.setMirrorMode.bind(ppu),
      setMirrorModeBit: ppu.setMirrorModeBit.bind(ppu),
      getPpuRegs: ppu.getRegs.bind(ppu),
      setChrData: ppu.setChrData.bind(ppu),
      writePpuDirect: ppu.writePpuDirect.bind(ppu),
      writeToApu: this.nes.writeToApu.bind(this.nes),
      readFromApu: this.nes.readFromApu.bind(this.nes),
    })

    this.nes.setMapper(this.mapper)
  }

  public setImage(image: Uint8Array): boolean {
    this.mapper.setImage(image)
    return true
  }

  public getSideCount(): number {
    return this.mapper.getSideCount()
  }

  public eject(): void {
    this.mapper.eject()
  }

  public setSide(side: number): void {
    this.mapper.setSide(side)
  }
}
