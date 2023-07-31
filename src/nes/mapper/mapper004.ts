// MMC3

import {IrqType} from '../cpu/cpu'
import {Mapper, MapperOptions} from './mapper'
import {MirrorMode, PpuReg, PpuMaskBit} from '../ppu/types'
import {Util} from '../../util/util'


export class Mapper004 extends Mapper {
	protected irqLatch = 0 //IRQ 計數器重載值。
	protected irqHlineCounter = -1	
	protected irqHlineValue = -1
	protected irqHlineEnable = false
	
	protected reg = new Uint8Array(4)
	protected regs = new Uint8Array(8)
	protected maxPrg = 0
	
	protected irqReloadValue = -1;
	protected irqCounter = 0;
	protected irqReload = false;
	protected irqEnabled = false;


	protected state_R8000: number
	protected state_RA000: number
	protected state_RA001: number
	
	currentRegister = 0
	chrMode = 0
	prgMode = 0
	
	wramEnabled = false
	wramWriteProtected = false
	
	public static create(options: MapperOptions): Mapper {
		return new Mapper004(options)
	}

	constructor(options: MapperOptions) {
		super(options, 0x2000)
		this.options.setWriteMemory(0x8000, 0xffff, (addr, value) => {
			//console.log("addr: " + adr.toString(16) + "," + "value: " + (value.toString(16)))
			this.mmc3(addr, value)
		})
		
		this.InitMapper()
	}

	public UpdateMirroring():void{
		//if(GetMirroringType() != MirroringType::FourScreens) {
			this.options.setMirrorMode(((this.state_RA000 & 0x01) == 0x01) ? MirrorMode.HORZ : MirrorMode.VERT);
		//}
	}
		
		
	public InitMapper():void{
		this.options.setPrgBank(0, 0)
		this.options.setPrgBank(1, 1)
		this.options.setPrgBank(2, -2)
		this.options.setPrgBank(3, -1)
		
		
		
		//// http://wiki.nesdev.com/w/index.php/INES#Flags_6
		//// iNes header, flags 6
		//// > Some mappers, such as MMC1, MMC3, and AxROM, can control nametable mirroring.
		//// > They ignore bit 0
		const mirror = MirrorMode.VERT
		//// Dirty hack: detect mirror mode from ROM hash.
		//const romHash = this.options.cartridge!.calcHashValue()
		//switch (romHash) {
		//	case '6c0cd447297e95e45db35a4373dbeae1':  // Babel no Tou
		//	case 'e791b12fc3419a2e2f8a5ed64b210d72':  // Dragon Spirit
		//	case '44c206c61ff37406815f21b922e105c7':  // Family Pinball
		//	case '98b3778d1e6045d2a3350eb7eb3b39fc':  // Genpei Touma Den
		//	case '1e377977f7e8c067dd7181271a467959':  // Valkyrie no Bouken
		//	case '002f464f224ccbed94427686815ab68b':  // Sanma no Mei Tantei
		//		mirror = MirrorMode.HORZ
		//		break
		//	default:
		//		break
		//}
		// Default vertical mirroring?
		this.options.setMirrorMode(mirror)
		
		
		
		
		this.reset()
		this.UpdateState()
		this.UpdatePrgMapping()
		this.UpdateMirroring();
	}
	
	public mmc3(addr: any, value: any): void{	
		switch((addr & 0xE001)) {
			case 0x8000:
				this.state_R8000 = value
				this.UpdateState()
				break
			case 0x8001:
				if(this.currentRegister <= 1) {
					value &= ~0x01;
				}
				this.regs[this.currentRegister] = value;
				this.UpdateState()
				break
			// Mirroring
			case 0xa000:
				this.state_RA000 = value;
				this.UpdateMirroring()
				break
			case 0xa001:
				this.state_RA001 = value;
				this.UpdateState()
				break
			// IRQ
			case 0xc000:
				this.irqLatch = value
				this.setIrqHlineValue(this.irqLatch)
				//this.irqReloadValue = value;
				break
			case 0xc001:
				this.irqHlineCounter = 0
				this.setIrqHlineValue(this.irqLatch)
				//this.irqCounter = 0;
				//this.irqReload = true;
				break
			case 0xe000:
				this.irqHlineEnable = false
				this.irqHlineCounter = 0
				//this.irqEnabled = false;
				//this.irqCounter = 0
				break
			case 0xe001:
				this.irqHlineEnable = true
				//this.irqEnabled = true;
				break
		}
	}
	
	public onHblank(hcount: number): void {
		// http://bobrost.com/nes/files/mmc3irqs.txt
		// Note: BGs OR sprites MUST be enabled in $2001 (bits 3 and 4)
		// in order for the countdown to occur.
		const regs = this.options.getPpuRegs()
		if ((regs[PpuReg.MASK] & (PpuMaskBit.SHOW_SPRITE | PpuMaskBit.SHOW_BG)) !== 0) {
			if (--this.irqHlineCounter === -2 && this.irqHlineEnable) {
				this.options.requestIrq(IrqType.EXTERNAL)
			}
		}
	
		switch (hcount) {
			case 0:
				this.irqHlineCounter = this.irqHlineValue
				break
			default:
				break
		}
	}
	
	protected setIrqHlineValue(line: number): void {
		this.irqHlineValue = line
		this.irqHlineCounter = this.irqHlineValue
	}
	
	protected enableIrqHline(value: boolean): void {
		this.irqHlineEnable = value
	}
	
	protected resetIrqHlineCounter(): void {
		
		this.irqHlineCounter = 0
	}
		
	public UpdateState(): void{
		this.currentRegister = this.state_R8000 & 0x07;
		this.chrMode = (this.state_R8000 & 0x80) >> 7;
		this.prgMode = (this.state_R8000 & 0x40) >> 6;
		this.wramEnabled = (this.state_RA001 & 0x80) == 0x80;
		this.wramWriteProtected = (this.state_RA001 & 0x40) == 0x40;
		this.UpdatePrgMapping()
		this.UpdateChrMapping()
	}
		
	public SelectPrgPage4x(slot: any, page: any):void{
		this.SelectPrgPage2x(slot*2, page);
		this.SelectPrgPage2x(slot*2+1, page+2);
	}
	
	public SelectPrgPage2x(slot: any, page: any):void{
		this.options.setPrgBank(slot*2, page)
		this.options.setPrgBank(slot*2+1, page+1)
	}

	public SelectPRGPage(slot: any, page: any):void{
		this.options.setPrgBank(slot, page)
	}

	public SelectChrPage4x(slot: any, page: any):void{
		this.SelectChrPage2x(slot*2, page);
		this.SelectChrPage2x(slot*2+1, page+2);
	}
	
	public SelectChrPage2x(slot: any, page: any):void{
		this.options.setChrBankOffset(slot*2, page);
		this.options.setChrBankOffset(slot*2+1, page+1);
	}

	public SelectCHRPage(slot: any, page: any):void{
		this.options.setChrBankOffset(slot, page)
	}
	
	public reset(): void {
		this.state_R8000 = 0
		this.state_RA000 = 0
		this.state_RA001 = 0
	
		this.irqCounter = 0
		this.irqReloadValue = -1
		this.irqReload = false
		this.irqEnabled = false
	}
	
	public save(): object {
		return super.save({
			regs: Util.convertUint8ArrayToBase64String(this.regs),
			bankSelect: this.currentRegister,
			irqHlineEnable: this.irqHlineEnable,
			irqHlineValue: this.irqHlineValue,
			irqHlineCounter: this.irqHlineCounter,
			irqLatch: this.irqLatch,
		})
	}

	public load(saveData: any): void {
		super.load(saveData)
		this.regs = Util.convertBase64StringToUint8Array(saveData.regs)
		this.currentRegister = saveData.currentRegister
		this.irqHlineEnable = saveData.irqHlineEnable
		this.irqHlineValue = saveData.irqHlineValue
		this.irqHlineCounter = saveData.irqHlineCounter
		this.irqLatch = saveData.irqLatch
		
		this.UpdatePrgMapping()
		this.UpdateChrMapping()
	}
  
  
	protected UpdatePrgMapping(): void {
		if (this.prgMode  == 0) {
			this.SelectPRGPage(0, this.regs[6])
			this.SelectPRGPage(1, this.regs[7])
			this.SelectPRGPage(2, -2)
			this.SelectPRGPage(3, -1)
		} else {
			this.SelectPRGPage(0, -2)
			this.SelectPRGPage(1, this.regs[7])
			this.SelectPRGPage(2, this.regs[6])
			this.SelectPRGPage(3, -1)
		}
	}

	protected UpdateChrMapping(): void {
		if (this.chrMode === 0) {
			this.SelectCHRPage(0, this.regs[0] & 0xfe)
			this.SelectCHRPage(1, this.regs[0] | 1)
			this.SelectCHRPage(2, this.regs[1] & 0xfe)
			this.SelectCHRPage(3, this.regs[1] | 1)
			this.SelectCHRPage(4, this.regs[2])
			this.SelectCHRPage(5, this.regs[3])
			this.SelectCHRPage(6, this.regs[4])
			this.SelectCHRPage(7, this.regs[5])
		} else {
			this.SelectCHRPage(0, this.regs[2])
			this.SelectCHRPage(1, this.regs[3])
			this.SelectCHRPage(2, this.regs[4])
			this.SelectCHRPage(3, this.regs[5])
			this.SelectCHRPage(4, this.regs[0] & 0xfe)
			this.SelectCHRPage(5, this.regs[0] | 1)
			this.SelectCHRPage(6, this.regs[1] & 0xfe)
			this.SelectCHRPage(7, this.regs[1] | 1)
		}
	}
}

export class Mapper088 extends Mapper004 {
	public static create(options: MapperOptions): Mapper {
		return new Mapper088(options)
	}

	constructor(protected options: MapperOptions) {
		super(options)
		
		// Select
		this.options.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
			if ((adr & 1) === 0) {
				this.state_R8000 = value & 0x07
				this.UpdatePrgMapping()
				this.UpdateChrMapping()
			} else {
				const reg = this.state_R8000 & 0x07
				if (reg < 6) {  // CHR
					value &= 0x3f
					if (reg >= 2)
						value |= 0x40
					this.regs[reg] = value
					this.UpdateChrMapping()
				} else {  // PRG
					this.regs[reg] = value
					this.UpdatePrgMapping()
				}
			}
		})
	}
}

const kMirrorModeTable95 = [
  MirrorMode.SINGLE0, MirrorMode.REVERSE_HORZ,
  MirrorMode.HORZ, MirrorMode.SINGLE1,
]

export class Mapper095 extends Mapper004 {
	public static create(options: MapperOptions): Mapper {
		return new Mapper095(options)
	}

	constructor(protected options: MapperOptions) {
		super(options)
		
		// Select
		this.options.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
			if ((adr & 1) === 0) {
				this.state_R8000 = value & 7
			} else {
				const reg = this.state_R8000 & 0x07
				if (reg < 6) {  // CHR
					this.regs[reg] = value & 0x3f
					this.UpdateChrMapping()
			
					if (reg === 0 || reg === 1) {
						const n1 = (this.regs[0] >> 5) & 1
						const n2 = (this.regs[1] >> 4) & 2
						this.options.setMirrorMode(kMirrorModeTable95[n2 | n1])
					}
				} else {  // PRG
					this.regs[reg] = value & 0x1f
					this.UpdatePrgMapping()
				}
			}
		})
	}
}

export class Mapper118 extends Mapper004 {
	public static create(options: MapperOptions): Mapper {
		return new Mapper118(options)
	}

	constructor(options: MapperOptions) {
		super(options)
		
		// Select
		this.options.setWriteMemory(0x8000, 0x9fff, (adr, value) => {
			if ((adr & 1) === 0) {
				this.state_R8000 = value
				this.UpdatePrgMapping()
				this.UpdateChrMapping()
			} else {
				const reg = this.state_R8000 & 0x07
				this.regs[reg] = value & 0x7f
				if (reg < 6) {  // CHR
					this.UpdateChrMapping()
				} else {  // PRG
					this.UpdatePrgMapping()
				}
			
				const chrA12 = this.regs[0] & 0x80
				const bank = this.regs[0] & 7
				if ((chrA12 === 0 && bank < 2) || (chrA12 !== 0 && bank >= 2 && bank < 6))
					this.options.setMirrorMode((value & 0x80) === 0 ? MirrorMode.SINGLE0 : MirrorMode.SINGLE1)
			}
		})
	}
}

export class Mapper115 extends Mapper004 {
	prgReg = 0;
	chrReg = 0;
	protectionReg = 0;
	
	public static create(options: MapperOptions): Mapper {
		return new Mapper115(options)
	}

	constructor(protected options: MapperOptions) {
		super(options)
		
		// Select
		this.options.setWriteMemory(0x6000, 0xffff, (addr, value) => {
			//console.log("adr: " + addr.toString(16) + "," + "value: " + value.toString(16))
			if(addr < 0x8000) {
				if(addr == 0x5080) {
					this.protectionReg = value;
				} else {
					switch(addr) {
						case 0x6000:
							this.prgReg = value;
							this.UpdateState115();
							break
						case 0x6001:
							this.chrReg = value & 0x01;
							this.UpdateState115();
							break
						default:
							break
					}
				}
			} else {
				this.mmc3(addr, value)
			}
		})
		
		this.InitMapper()
	}
	
	public SelectCHRPage(slot: any, page: any): void{
		page |= (this.chrReg << 8);
		this.options.setChrBankOffset(slot, page)
	}


	public UpdateState115(): void{
		this.UpdateState()
		
		if(this.prgReg & 0x80) { //0xa0 & 0x80 = 0x80
			if(this.prgReg & 0x20) {
				this.SelectPrgPage4x(0, ((this.prgReg & 0x0F) >> 1) << 2);
			} else {
				this.SelectPrgPage2x(0, (this.prgReg & 0x0F) << 1);
				this.SelectPrgPage2x(1, (this.prgReg & 0x0F) << 1);
			}
		}
	}
}

export class Mapper245 extends Mapper004 {
	prgReg = 0;
	lastPageInBlock: number
	
	public static create(options: MapperOptions): Mapper {
		return new Mapper245(options)
	}
	
	public UpdateState(): void{
		this.currentRegister = this.state_R8000 & 0x07;
		this.chrMode = (this.state_R8000 & 0x80) >> 7;
		this.prgMode = (this.state_R8000 & 0x40) >> 6;
		this.wramEnabled = (this.state_RA001 & 0x80) == 0x80;
		this.wramWriteProtected = (this.state_RA001 & 0x40) == 0x40;
		this.UpdatePrgMapping()
		this.UpdateChrMapping()
		
		
		if(this.chrMode) {
			this.SelectChrPage4x(0, 4);
			this.SelectChrPage4x(1, 0);
		} else {
			this.SelectChrPage4x(0, 0);
			this.SelectChrPage4x(1, 4);
		}
		
	}
	
	protected UpdatePrgMapping(): void {
		const orValue = this.regs[0] & 0x02 ? 0x40 : 0x00;
		this.regs[6] = (this.regs[6] & 0x3F) | orValue;
		this.regs[7] = (this.regs[7] & 0x3F) | orValue;

		this.lastPageInBlock = -1
		
		if(this.prgMode == 0) {
			this.options.setPrgBank(0, this.regs[6]);
			this.options.setPrgBank(1, this.regs[7]);
			this.options.setPrgBank(2, this.lastPageInBlock - 1);
			this.options.setPrgBank(3, this.lastPageInBlock);
		} else if(this.prgMode == 1) {
			this.options.setPrgBank(0, this.lastPageInBlock-1);
			this.options.setPrgBank(1, this.regs[7]);
			this.options.setPrgBank(2, this.regs[6]);
			this.options.setPrgBank(3, this.lastPageInBlock);
		}
	}
}

export class Mapper250 extends Mapper004 {
	public static create(options: MapperOptions): Mapper {
		return new Mapper250(options)
	}
	
	constructor(protected options: MapperOptions) {
		super(options)
		this.options.setWriteMemory(0x6000, 0xffff, (addr) => {
			
			//console.log("adr: " + addr.toString(16) + "," + "value: " + value.toString(16))
			this.mmc3((addr & 0xE000) | ((addr & 0x0400) >> 10), addr & 0xFF)
		})
	}
}

export class Mapper044 extends Mapper004 {
	selectedBlock = 0
	
	public static create(options: MapperOptions): Mapper {
		return new Mapper044(options)
	}
	
	constructor(protected options: MapperOptions) {
		super(options)
		
		this.options.setWriteMemory(0x6000, 0xffff, (addr, value) => {
			//console.log("adr: " + addr.toString(16) + "," + "value: " + value.toString(16))
			if((addr & 0xE001) == 0xA001) {
				this.selectedBlock = value & 0x07;
				if(this.selectedBlock == 7) {
					this.selectedBlock = 6;
				}
			}
			this.mmc3(addr, value)
		})
	}
	
	public reset(): void{
		this.selectedBlock = 0;
		this.UpdateState();
	}

	public SelectCHRPage(slot: any, page: any):void{
		page &= this.selectedBlock <= 5 ? 0x7F : 0xFF;
		page |= this.selectedBlock * 0x80;

		this.options.setChrBankOffset(slot, page)
	}

	public SelectPRGPage(slot: any, page: any):void{
		page &= this.selectedBlock <= 5 ? 0x0F : 0x1F;
		page |= this.selectedBlock * 0x10;

		this.options.setPrgBank(slot, page)
	}
}

export class Mapper045 extends Mapper004 {
	regIndex = 0
	
	public static create(options: MapperOptions): Mapper {
		return new Mapper045(options)
	}
	
	constructor(protected options: MapperOptions) {
		super(options)
		// Select
		this.options.setWriteMemory(0x6000, 0xffff, (addr, value) => {
			//console.log("adr: " + addr.toString(16) + "," + "value: " + value.toString(16))
			if(addr < 0x8000) {
				if(this.reg[3] & 0x40) {
					//RemoveRegisterRange(0x6000, 0x7FFF);
				}else{
					if(!(this.reg[3] & 0x40)) {
						this.reg[this.regIndex] = value;
						this.regIndex = (this.regIndex + 1) & 0x03;
					}
					this.UpdateState();
				}
			} else {
				this.mmc3(addr, value)
			}
		})
		
		this.InitMapper()
		
	}
	
	public InitMapper(): void{
		this.options.setPrgBank(0, 0)
		this.options.setPrgBank(1, 1)
		this.options.setPrgBank(2, -2)
		this.options.setPrgBank(3, -1)
		
		
		this.reset()
		this.UpdateState()
		this.UpdatePrgMapping()
		this.UpdateMirroring();
		
		
		
		this.regs[0] = 0
		this.regs[1] = 2
		this.regs[2] = 4
		this.regs[3] = 5
		this.regs[4] = 6
		this.regs[5] = 7
		this.UpdateChrMapping()	
	}
	
	public reset(): void{
		this.regIndex = 0;
		this.regs[0] = 0
		this.regs[1] = 0
		this.regs[2] = 0
		this.regs[3] = 0
		this.regs[4] = 0
		this.regs[5] = 0
		this.regs[6] = 0
		this.regs[7] = 0
		this.reg[2] = 0x0f
		this.UpdateState()
	}

	public SelectCHRPage(slot: any, page: any):void{
		//if(!HasChrRam()) {
			page &= 0xFF >> (0x0F - (this.reg[2] & 0x0F));
			page |= this.reg[0] | ((this.reg[2] & 0xF0) << 4);
		//}
		this.options.setChrBankOffset(slot, page)
	}

	public SelectPRGPage(slot: any, page: any):void{
		page &= 0x3f ^ (this.reg[3] & 0x3f);
		page |= this.reg[1];
		this.options.setPrgBank(slot, page)
	}
}

export class Mapper052 extends Mapper004 {
	extraReg = 0
	
	public static create(options: MapperOptions): Mapper {
		return new Mapper052(options)
	}

	constructor(protected options: MapperOptions) {
		super(options)
		
		this.options.setWriteMemory(0x6000, 0xffff, (addr, value) => {
			//console.log("adr: " + addr.toString(16) + "," + "value: " + value.toString(16))
			if(addr < 0x8000) {
				//if(CanWriteToWorkRam()) {
					if((this.extraReg & 0x80) == 0) {
						this.extraReg = value;
						this.UpdateState();
					} else {
						//this.WritePrgRam(addr, value);
					}
				//}
			} else {
				this.mmc3(addr, value)
			}
		})
		
		this.regs[0] = 0
		this.regs[1] = 2
		this.regs[2] = 4
		this.regs[3] = 5
		this.regs[4] = 6
		this.regs[5] = 7
		this.UpdateChrMapping()
	}
	
	public reset(): void{
		this.extraReg = 0;
		this.UpdateState();
	}

	public SelectCHRPage(slot: any, page: any):void{
		if(this.extraReg & 0x40) {
			page &= 0x7F;
			page |= ((this.extraReg & 0x04) | ((this.extraReg >> 4) & 0x03)) << 7;
		} else {
			page &= 0xFF;
			page |= ((this.extraReg & 0x04) | ((this.extraReg >> 4) & 0x02)) << 7;
		}
		this.options.setChrBankOffset(slot, page)
	}

	public SelectPRGPage(slot: any, page: any):void{
		if(this.extraReg & 0x08) {
			page &= 0x0F;
			page |= (this.extraReg & 0x07) << 4;
		} else {
			page &= 0x1F;
			page |= (this.extraReg & 0x06) << 4;
		}
		this.options.setPrgBank(slot, page)
	}
}

//MMC3_BmcF15.h
export class Mapper019 extends Mapper004 {
	exReg: number
	
	public static create(options: MapperOptions): Mapper {
		return new Mapper019(options)
	}

	constructor(protected options: MapperOptions) {
		super(options)

		this.options.setWriteMemory(0x6000, 0xffff, (addr, value) => {
			console.log("adr: " + addr.toString(16) + "," + "value: " + value.toString(16))
			if(addr < 0x8000) {
				//if(GetState().RegA001 & 0x80) {
					this.exReg = value & 0x0F;
					this.UpdatePrgMapping();
				//}
			} else {
				this.mmc3(addr, value)
			}
		})
		
		this.exReg = 0
	}
	
	public UpdatePrgMapping(): void{
		const bank = this.exReg & 0x0F;
		const mode = (this.exReg & 0x08) >> 3;
		const mask = ~mode;
		this.SelectPrgPage2x(0, (bank & mask) << 1);
		this.SelectPrgPage2x(1, ((bank & mask) | mode) << 1);
	}
}


export class Mapper012 extends Mapper004 {
	chrSelection = 0;
	
	public static create(options: MapperOptions): Mapper {
		return new Mapper012(options)
	}

	constructor(protected options: MapperOptions) {
		super(options)
		// Select
		this.options.setWriteMemory(0x8000, 0xffff, (addr, value) => {
			//console.log("adr: " + addr.toString(16) + "," + "value: " + value.toString(16))
			if(addr <= 0x5FFF) {
				this.chrSelection = value;
				this.UpdateState();
			} else {
				this.mmc3(addr, value)
			}
		})
	}
	
	public SelectCHRPage(slot: any, page: any):void{
		if(slot < 4 && (this.chrSelection & 0x01)) {
			//0x0000 to 0x0FFF
			page |= 0x100;
		} else if(slot >= 4 && (this.chrSelection & 0x10)) {
			//0x1000 to 0x1FFF
			page |= 0x100;
		}
		this.options.setChrBankOffset(slot, page)
	}
}

export class Mapper182 extends Mapper004 {
	data: number
	public static create(options: MapperOptions): Mapper {
		return new Mapper182(options)
	}

	constructor(protected options: MapperOptions) {
		super(options)
		// Select
		this.options.setWriteMemory(0x8000, 0xffff, (addr, value) => {
		
			switch(addr & 0xE001) {
				case 0x8001:
					this.mmc3(0xA000, value)
					break;
				case 0xA000:
					this.data = (value & 0xF8);
					switch(value & 0x07) {
						case 0: this.data |= 0; break;
						case 1: this.data |= 3; break;
						case 2: this.data |= 1; break;
						case 3: this.data |= 5; break;
						case 4: this.data |= 6; break;
						case 5: this.data |= 7; break;
						case 6: this.data |= 2; break;
						case 7: this.data |= 4; break;
					}
					this.mmc3(0x8000, this.data)
					break
				case 0xC000:
					this.mmc3(0x8001, value)
					break
				case 0xC001:
					this.mmc3(0xC000, value)
					this.mmc3(0xC001, value)
					break;
				case 0xE000:
					this.mmc3(0xE000, value)
					break
				case 0xE001:
					this.mmc3(0xE001, value)
					break
			}
			
		})
	}
}

export class Mapper091 extends Mapper004 {
	public static create(options: MapperOptions): Mapper {
		return new Mapper091(options)
	}

	constructor(protected options: MapperOptions) {
		super(options)
		// Select
		this.options.setWriteMemory(0x6000, 0x7fff, (addr, value) => {
			switch(addr & 0x7003) {
				case 0x6000: this.SelectChrPage2x(0, value*2); break;
				case 0x6001: this.SelectChrPage2x(1, value*2); break;
				case 0x6002: this.SelectChrPage2x(2, value*2); break;
				case 0x6003: this.SelectChrPage2x(3, value*2); break;
				case 0x7000: this.SelectPRGPage(0, value & 0x0F); break;
				case 0x7001: this.SelectPRGPage(1, value & 0x0F); break;
				case 0x7002: 
					this.mmc3(0xE000, value); 
					break;
				case 0x7003: 
					this.mmc3(0xC000, 0x07); 
					this.mmc3(0xC001, value);
					this.mmc3(0xE001, value);
					break;
			}
		
		
		})
		this.InitMapper()
	}

	public InitMapper():void{
		this.SelectPRGPage(2, -2);
		this.SelectPRGPage(3, -1);
	}
}



