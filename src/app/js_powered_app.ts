// JS-powered NES
// Run JavaScript code, instead of 6502 CPU.

import {App, Option} from './app'
import {AppEvent} from './app_event'
import {AudioManager} from '../util/audio_manager'
import {DomUtil} from '../util/dom_util'
import {Nes} from '../nes/nes'
import {WindowManager} from '../wnd/window_manager'
import {VBlank} from '../nes/const'
import {Address, Byte} from '../nes/types'

const MAX_FRAME_COUNT = 4

interface Accessor {
  getRam(): Uint8Array  // Size=0x0800
  read8(adr: Address): Byte
  write8(adr: Address, value: Byte): void
  setReadMemory(start: Address, end: Address, reader: (addr: number) => number): void
  setWriteMemory(start: Address, end: Address, writer: (addr: number, value: number) => void): void
  waitHline(hcount: number): void
}

interface JsCpu {
  getMapperNo(): number
  init(accessor: Accessor): void
  getChrRom(): Uint8Array | Promise<Uint8Array>
  reset(): void
  update(): void
}

export class JsNes extends Nes {
  public jsCpu: JsCpu
  private file: File
  private hcount = 0

  public constructor() {
    super({
      nmiFn: () => {},  // Dummy NMI
      apuIrqFn: () => {},  // Dummy APU IRQ
    })
    this.reset()
  }

  public async setFile(file: File): Promise<void> {
    if (file == null)
      return Promise.reject('null')
    this.file = file

    this.setMemoryMap()

    return this.reload()
  }

  public async reload(): Promise<void> {
    const data = await DomUtil.loadFile(this.file)
    const jsCode = new TextDecoder('utf-8').decode(data)
    const jsCodeFn = `'use strict'; return (() => { ${jsCode} })()`
    this.jsCpu = Function('window', 'alert', jsCodeFn)()
    let chrRom = this.jsCpu.getChrRom()
    if (chrRom != null && (chrRom as any).then != null)
      chrRom = await chrRom
    this.ppu.setChrData(chrRom as Uint8Array)

    const mapperNo = this.jsCpu.getMapperNo != null ? this.jsCpu.getMapperNo() : 0
    if (!Nes.isMapperSupported(mapperNo))
      return Promise.reject(`Mapper ${mapperNo} not supported`)
    this.mapper = this.createMapper(mapperNo, null)

    this.jsCpu.init({
      getRam: () => this.ram,
      read8: this.bus.read8.bind(this.bus),
      write8: this.bus.write8.bind(this.bus),
      setReadMemory: this.bus.setReadMemory.bind(this.bus),
      setWriteMemory: this.bus.setWriteMemory.bind(this.bus),
      waitHline: this.waitHline.bind(this),
    })
  }

  public setHcount(hcount: number) {
    this.hcount = hcount
    this.ppu.setHcount(hcount)
    this.apu.onHblank(hcount)
  }

  public reset(): void {
    this.ram.fill(0xff)
    this.ppu.reset()
    this.apu.reset()
    if (this.jsCpu != null)
      this.jsCpu.reset()
  }

  public update(): void {
    this.hcount = VBlank.END
    if (this.jsCpu != null)
      this.jsCpu.update()
  }

  private waitHline(hcount: number) {
    if (hcount > VBlank.START || (this.hcount <= VBlank.START && hcount >= this.hcount))
      return

    if (this.hcount >= VBlank.END) {
      while (this.hcount < VBlank.VRETURN) {
        this.setHcount(this.hcount + 1)
      }
      this.hcount = -1
    }
    while (this.hcount < hcount) {
      this.setHcount(this.hcount + 1)
    }
  }
}

export class JsApp extends App {
  private leftTime = 0

  public static create(wndMgr: WindowManager, option: Option, jsNes: JsNes) {
    return new JsApp(wndMgr, option, jsNes)
  }

  protected constructor(wndMgr: WindowManager, option: Option, private jsNes: JsNes) {
    super(wndMgr, option, jsNes, true)
  }

  public async setFile(file: File): Promise<void> {
    await this.jsNes.setFile(file)
    // @ts-expect-error - probably old/broken code? shouldn't instantiate an abstrat class
    this.audioManager = new AudioManager()
    this.setupAudioManager()
  }

  protected handleAppEvent(type: AppEvent.Type, param?: any): void {
    switch (type) {
    case AppEvent.Type.RESET:
      this.jsNes.reset()
      break
    default:
      return super.handleAppEvent(type, param)
    }
  }

  protected update(elapsedTime: number): void {
    for (let i = 0; i < 2; ++i) {
      const pad = this.screenWnd.getPadStatus(i)
      this.nes.setPadStatus(i, pad)
    }

    const et = elapsedTime + this.leftTime
    let frameCount = (et * 60 / 1000) | 0
    if (frameCount <= MAX_FRAME_COUNT) {
      this.leftTime = et - ((frameCount * 1000 / 60) | 0)
    } else {
      frameCount = MAX_FRAME_COUNT
      this.leftTime = 0
    }

    frameCount *= this.screenWnd.getTimeScale()

    if (frameCount > 0) {
      for (let i = 0; i < frameCount; ++i) {
        this.jsNes.update()
        this.updateAudio()

        for (let i = VBlank.NMI; i <= VBlank.END; ++i) {
          this.jsNes.setHcount(i)
        }
      }
      this.screenWnd.render()

      this.stream.triggerRender()
    }
  }
}
