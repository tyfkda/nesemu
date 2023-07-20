import {Mapper, MapperOptions} from './mapper'
import {MirrorMode} from '../ppu/types'

const kMirrorTable = [
  MirrorMode.VERT,
  MirrorMode.HORZ,
]


export class Mapper033 extends Mapper {
	public static create(options: MapperOptions): Mapper {
		return new Mapper033(options)
	}
	
	constructor(options: MapperOptions) {
		super(options)
		
		const BANK_BIT = 13  // 0x2000
		const maxPrg = (options.cartridge!.prgRom.byteLength >> BANK_BIT) - 1
		const kLast2Bank = maxPrg - 1

		this.options.setPrgBank(0, 0)
		this.options.setPrgBank(1, 1)
		this.options.setPrgBank(2, kLast2Bank)
		this.options.setPrgBank(3, kLast2Bank+1)
	
	
		// Chr ROM bank
		this.options.setWriteMemory(0x8000, 0xffff, (adr, value) => {
			switch (adr & 0xa003) {
				case 0x8000:
					this.options.setPrgBank(0, value & 0x3f)
					this.options.setMirrorMode((value & 0x40) === 0x40 ? MirrorMode.HORZ : MirrorMode.VERT)
					break
				case 0x8001:
					this.options.setPrgBank(1, value & 0x3f)
					break
				case 0x8002:
					this.options.setChrBankOffset(0, value*2)
					this.options.setChrBankOffset(1, value*2+1)
					break
				case 0x8003:
					this.options.setChrBankOffset(2, value*2)
					this.options.setChrBankOffset(3, value*2+1)
					break
				case 0xa000: case 0xa001: case 0xa002: case 0xa003:
					this.options.setChrBankOffset(4 + (adr & 0x03), value)
					break
			}
		})
	}
}
