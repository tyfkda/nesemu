import WindowManager from '../wnd/window_manager'
import Wnd from '../wnd/wnd'

import DomUtil from '../util/dom_util'
import Nes from '../nes/nes'
import {Addressing, Instruction, OpType, kInstTable} from '../nes/cpu/inst'
import disassemble from '../nes/cpu/disasm'
import Util from '../util/util'

import {AppEvent} from './app_event'

import * as Pubsub from '../util/pubsub'

export class RegisterWnd extends Wnd {
  protected valueElems = new Array<HTMLInputElement>()
  protected subscription: Pubsub.Subscription

  private static createPregStr(p): string {
    const chrs = 'NV_BDIZC'
    const ss = new Array<string>(8)
    for (let i = 0; i < 8; ++i)
      ss[i] = ((p & (0x80 >> i)) !== 0) ? chrs[i] : '.'
    return ss.join('')
  }

  public constructor(wndMgr: WindowManager, protected nes: Nes, protected stream: AppEvent.Stream) {
    super(wndMgr, 100, 160, 'Regs')

    const content = this.createContent()
    this.setContent(content)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RESET:
        case AppEvent.Type.STEP:
        case AppEvent.Type.PAUSE:
        case AppEvent.Type.BREAK_POINT:
          this.updateStatus()
          break
        }
      })
  }

  public updateStatus(): void {
    const cpu = this.nes.getCpu()
    const regs = cpu.getRegs()
    this.valueElems[0].value = Util.hex(regs.pc, 4)
    this.valueElems[1].value = Util.hex(regs.a, 2)
    this.valueElems[2].value = Util.hex(regs.x, 2)
    this.valueElems[3].value = Util.hex(regs.y, 2)
    this.valueElems[4].value = Util.hex(regs.s, 2)
    this.valueElems[5].value = RegisterWnd.createPregStr(regs.p)
    this.valueElems[6].value = String(this.nes.getCycleCount())
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  protected createContent(): HTMLElement {
    const root = document.createElement('div')
    root.className = 'fixed-font'

    const kElems = [
      {name: 'PC'},
      {name: 'A'},
      {name: 'X'},
      {name: 'Y'},
      {name: 'S'},
      {name: 'P'},
      {name: 'cycle'},
    ]
    const table = document.createElement('table')
    DomUtil.setStyles(table, {
      fontSize: '10px',
      width: '100%',
    })
    this.valueElems = [] as HTMLInputElement[]
    for (let i = 0; i < kElems.length; ++i) {
      const tr = document.createElement('tr')
      table.appendChild(tr)
      const name = document.createElement('td')
      name.innerText = kElems[i].name
      tr.appendChild(name)
      const value = document.createElement('td')
      tr.appendChild(value)
      const valueInput = document.createElement('input')
      valueInput.className = 'fixed-font'
      valueInput.type = 'text'
      valueInput.style.width = '100%'
      value.appendChild(valueInput)
      this.valueElems.push(valueInput)
    }
    root.appendChild(table)
    return root
  }
}

const MAX_BYTES = 3
const MAX_LINE = 100

const kIllegalInstruction: Instruction = {
  opType: OpType.UNKNOWN,
  addressing: Addressing.UNKNOWN,
  bytes: 1,
  cycle: 0,
}

export class TraceWnd extends Wnd {
  private textarea: HTMLTextAreaElement

  private mem = new Uint8Array(MAX_BYTES)
  private bins = new Array<string>(MAX_BYTES)
  private lines = new Array<string>()
  private subscription: Pubsub.Subscription

  public constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 400, 160, 'Trace')

    const content = this.createContent()
    this.setContent(content)
    this.reset()

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RESET:
          this.reset()
          // Fall through.
        case AppEvent.Type.STEP:
        case AppEvent.Type.PAUSE:
        case AppEvent.Type.BREAK_POINT:
          this.updateStatus()
          break
        }
      })
  }

  public reset(): void {
    this.lines = []
  }

  public updateStatus(): void {
    const cpu = this.nes.getCpu()
    const bus = this.nes.getBus()
    const pc = cpu.getRegs().pc
    const op = bus.read8(pc)
    const inst = kInstTable[op] || kIllegalInstruction

    for (let i = 0; i < inst.bytes; ++i) {
      const m = bus.read8(pc + i)
      this.mem[i] = m
      this.bins[i] = Util.hex(m, 2)
    }
    for (let i = inst.bytes; i < MAX_BYTES; ++i)
      this.bins[i] = '  '

    const pcStr = Util.hex(pc, 4)
    const binStr = this.bins.join(' ')
    const asmStr = disassemble(inst, this.mem, 1, pc)
    this.putConsole(`${pcStr}: ${binStr}   ${asmStr}`)
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private createContent(): HTMLElement {
    const root = document.createElement('div')
    const textarea = document.createElement('textarea')
    textarea.className = 'fixed-font'
    DomUtil.setStyles(textarea, {
      fontSize: '14px',
      width: '100%',
      height: '160px',
      resize: 'none',
      margin: '0',
      padding: '2px',
      border: 'none',
      boxSizing: 'border-box',
    })
    root.appendChild(textarea)
    this.textarea = textarea
    return root
  }

  private putConsole(line: string): void {
    this.lines.push(line)
    if (this.lines.length > MAX_LINE)
      this.lines.shift()
    this.textarea.value = this.lines.join('\n')
    this.textarea.scrollTop = this.textarea.scrollHeight
  }
}

export class ControlWnd extends Wnd {
  private stepBtn: HTMLButtonElement
  private runBtn: HTMLButtonElement
  private pauseBtn: HTMLButtonElement
  private subscription: Pubsub.Subscription

  public constructor(wndMgr: WindowManager, private stream: AppEvent.Stream) {
    super(wndMgr, 192, 32, 'Control')

    const content = this.createElement()
    this.setContent(content)
    this.updateState(true)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RUN:
          this.updateState(false)
          break
        case AppEvent.Type.PAUSE:
        case AppEvent.Type.BREAK_POINT:
          this.updateState(true)
          break
        }
      })
  }

  public updateState(paused: boolean): void {
    this.stepBtn.disabled = !paused
    this.runBtn.disabled = !paused
    this.pauseBtn.disabled = paused
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private createElement(): HTMLElement {
    const root = document.createElement('div')
    DomUtil.setStyles(root, {
      width: '256px',
      height: '32px',
    })

    this.stepBtn = document.createElement('button') as HTMLButtonElement
    this.stepBtn.innerText = 'Step'
    this.stepBtn.addEventListener('click', () => {
      this.stream.triggerStep()
    })
    root.appendChild(this.stepBtn)

    this.runBtn = document.createElement('button') as HTMLButtonElement
    this.runBtn.innerText = 'Run'
    this.runBtn.addEventListener('click', () => {
      this.stream.triggerRun()
    })
    root.appendChild(this.runBtn)

    this.pauseBtn = document.createElement('button') as HTMLButtonElement
    this.pauseBtn.innerText = 'Pause'
    this.pauseBtn.addEventListener('click', () => {
      this.stream.triggerPause()
    })
    root.appendChild(this.pauseBtn)

    const resetBtn = document.createElement('button') as HTMLButtonElement
    resetBtn.innerText = 'Reset'
    resetBtn.addEventListener('click', () => {
      this.stream.triggerReset()
    })
    root.appendChild(resetBtn)

    return root
  }
}
