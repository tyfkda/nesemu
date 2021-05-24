import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'

import {DomUtil} from '../util/dom_util'
import {Nes} from '../nes/nes'
import {Addressing, Instruction, OpType, kInstTable} from '../nes/cpu/inst'
import {disassemble} from '../nes/cpu/disasm'
import {Util} from '../util/util'
import {WndEvent} from '../wnd/types'

import {AppEvent} from './app_event'

import * as Pubsub from '../util/pubsub'

export class RegisterWnd extends Wnd {
  protected valueElems = new Array<HTMLInputElement>()
  protected subscription: Pubsub.Subscription

  private static createPregStr(p: number): string {
    const chrs = 'NV_BDIZC'
    const ss = new Array<string>(8)
    for (let i = 0; i < 8; ++i)
      ss[i] = (p & (0x80 >> i)) !== 0 ? chrs[i] : '.'
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

    wndMgr.add(this)
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
    this.valueElems = new Array<HTMLInputElement>()
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

export class RamWnd extends Wnd {
  private static RAM_SIZE = 0x800
  private static MARGIN = 4
  private static LINE_HEIGHT = 14
  private static COL_NO_CHANGE = ''
  private static COL_CHANGED = '#c22'

  private subscription: Pubsub.Subscription
  private contentRoot: HTMLElement
  private cells: Array<HTMLElement>
  private memBuf1: Uint8Array = new Uint8Array(RamWnd.RAM_SIZE)
  private memBuf2: Uint8Array = new Uint8Array(RamWnd.RAM_SIZE)
  private dirty = false
  private visibleStartAdr = 0
  private visibleEndAdr = 0

  public constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, 420, 254, 'Ram')

    this.setUpMenuBar()
    const {root, contentRoot, cells} = this.createContent()
    this.setContent(root)
    this.contentRoot = contentRoot
    this.cells = cells

    this.addResizeBox()
    this.updateStatus()

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.PAUSE:
        case AppEvent.Type.STEP:
        case AppEvent.Type.BREAK_POINT:
          this.updateStatus()
          this.render(0, RamWnd.RAM_SIZE)
          break
        case AppEvent.Type.RESET:
        case AppEvent.Type.RUN:
        case AppEvent.Type.RENDER:
          this.updateStatus()
          this.render()
          break
        }
      })

    this.dirty = true
    this.contentRoot.addEventListener('scroll', _ => {
      if (this.nes.getCpu().isPaused()) {
        this.updateVisibleArea()
        this.render()
      } else {
        this.dirty = true
      }
    })
  }

  public onEvent(event: WndEvent, _param?: any): any {
    switch (event) {
    case WndEvent.RESIZE_END:
      this.updateVisibleArea()
      this.dirty = false
      break
    default:
      break
    }
  }

  private updateStatus(): void {
    const bus = this.nes.getBus()
    const prev = this.memBuf1
    const curr = this.memBuf2
    for (let i = 0; i < RamWnd.RAM_SIZE; ++i)
      curr[i] = bus.read8(i)
    this.memBuf1 = curr
    this.memBuf2 = prev
  }

  private render(startAdr: number = this.visibleStartAdr, endAdr: number = this.visibleEndAdr): void {
    if (this.dirty) {
      this.updateVisibleArea()
      this.dirty = false
    }

    const curr = this.memBuf1
    const prev = this.memBuf2

    for (let i = startAdr|0, end = endAdr|0 ; i < end; ++i) {
      const cell = this.cells[i]
      const x = curr[i]
      const hh = Util.hex(x, 2)
      if (cell.innerText !== hh)
        cell.innerText = hh
      const bg = x === prev[i] ? RamWnd.COL_NO_CHANGE : RamWnd.COL_CHANGED
      if (cell.style.backgroundColor !== bg)
        cell.style.backgroundColor = bg
    }
  }

  private updateVisibleArea(): void {
    const rc = this.contentHolder.getBoundingClientRect()
    const top = this.contentRoot.scrollTop
    const start = Math.floor((top - RamWnd.MARGIN) / RamWnd.LINE_HEIGHT) | 0
    const end = Math.floor((top + rc.height - RamWnd.MARGIN) / RamWnd.LINE_HEIGHT) | 0
    this.visibleStartAdr = Util.clamp(start * 16, 0, RamWnd.RAM_SIZE)
    this.visibleEndAdr = Util.clamp((end + 1) * 16, 0, RamWnd.RAM_SIZE)
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private createContent(): {root: HTMLElement; contentRoot: HTMLElement; cells: Array<HTMLSpanElement>} {
    const root = document.createElement('div')
    root.className = 'ramwnd full-size fixed-font'

    const top = document.createElement('div')
    DomUtil.setStyles(top, {
      position: 'absolute',
      top: 0,
      height: `${RamWnd.LINE_HEIGHT}px`,
      left: 0,
      right: 0,
      overflow: 'hidden',
      margin: `0 ${RamWnd.MARGIN}px`,
      color: '#0ff',
    })
    const columns1 = [...Array(8)].map((_, i) => `+${i.toString(16)}`).join(' ')
    const columns2 = [...Array(8)].map((_, i) => `+${(i + 8).toString(16)}`).join(' ')
    top.appendChild(document.createTextNode(`ADDR: ${columns1}\u00a0\u00a0${columns2}`))

    const contentRoot = document.createElement('div')
    DomUtil.setStyles(contentRoot, {
      position: 'absolute',
      top: `${RamWnd.LINE_HEIGHT}px`,
      bottom: 0,
      left: 0,
      right: 0,
      overflowY: 'scroll',
      userSelect: 'all',
    })

    const scroll = document.createElement('div')
    DomUtil.setStyles(scroll, {
      overflowX: 'hidden',
      margin: `0 ${RamWnd.MARGIN}px ${RamWnd.MARGIN}px ${RamWnd.MARGIN}px`,
      whiteSpace: 'nowrap',
    })

    const lineDivs = new Array<HTMLElement>()
    const cells = new Array<HTMLElement>()
    for (let i = 0; i < RamWnd.RAM_SIZE / 16; ++i) {
      const line = document.createElement('div')
      DomUtil.setStyles(line, {
        height: `${RamWnd.LINE_HEIGHT}px`,
      })
      scroll.appendChild(line)
      lineDivs.push(line)
      line.appendChild(document.createTextNode(`${Util.hex(i * 16, 4)}: `))
      for (let j = 0; j < 16; ++j) {
        if (j > 0)
          line.appendChild(document.createTextNode(j === 8 ? '\u00a0\u00a0' : ' '))
        const cell = document.createElement('span')
        cell.innerText = '00'
        line.appendChild(cell)
        cells.push(cell)
      }
    }

    contentRoot.appendChild(scroll)
    root.appendChild(top)
    root.appendChild(contentRoot)
    return {root, contentRoot, cells}
  }

  protected setUpMenuBar(): void {
    const menuItems = [
      {
        label: 'File',
        submenu: [
          {
            label: 'Save',
            click: () => this.save(),
          },
        ],
      },
    ]
    this.addMenuBar(menuItems)
  }

  private async save(): Promise<void> {
    const paused = this.nes.getCpu().isPaused()
    if (!paused)
      this.stream.triggerPause()
    const data = this.memBuf1
    try {
      await DomUtil.downloadOrSaveToFile(data, 'ram.bin', 'RAM data', 'application/binary', '.bin')
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(e)
        this.wndMgr.showSnackbar(`Failed: ${e.toString()}`)
      }
    } finally {
      if (!paused)
        this.stream.triggerRun()
    }
  }
}

const MAX_BYTES = 3
const MAX_LINE = 100

const kIllegalInstruction: Instruction = {
  opType: OpType.UNKNOWN,
  addressing: Addressing.UNKNOWN,
  bytes: 1,
  cycle: 0,
  read: false,
  write: false,
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

    wndMgr.add(this)
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

    wndMgr.add(this)
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

    this.stepBtn = document.createElement('button')
    this.stepBtn.innerText = 'Step'
    this.stepBtn.addEventListener('click', () => {
      this.stream.triggerStep()
    })
    root.appendChild(this.stepBtn)

    this.runBtn = document.createElement('button')
    this.runBtn.innerText = 'Run'
    this.runBtn.addEventListener('click', () => {
      this.stream.triggerRun()
    })
    root.appendChild(this.runBtn)

    this.pauseBtn = document.createElement('button')
    this.pauseBtn.innerText = 'Pause'
    this.pauseBtn.addEventListener('click', () => {
      this.stream.triggerPause()
    })
    root.appendChild(this.pauseBtn)

    const resetBtn = document.createElement('button')
    resetBtn.innerText = 'Reset'
    resetBtn.addEventListener('click', () => {
      this.stream.triggerReset()
    })
    root.appendChild(resetBtn)

    return root
  }
}
