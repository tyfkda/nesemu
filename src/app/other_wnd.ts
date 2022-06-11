import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'
import {WndEvent} from '../wnd/types'

import {AudioManager} from '../util/audio_manager'
import {WaveType} from '../nes/apu'
import {DomUtil} from '../util/dom_util'
import {GlobalSetting} from './global_setting'
import {Nes} from '../nes/nes'
import {Ppu} from '../nes/ppu/ppu'
import {PpuDebug} from './ppu_debug'
import {kPaletColors} from '../nes/ppu/const'

import {AppEvent} from './app_event'

import * as Pubsub from '../util/pubsub'
// import * as Stats from 'stats-js'
const Stats = require('stats-js')  // eslint-disable-line @typescript-eslint/no-var-requires

import aboutHtmlContent from '../res/about.html'

import * as pluseImg from '../res/pulse.png'
import * as triangleImg from '../res/triangle.png'
import * as sawtoothImg from '../res/sawtooth.png'

export class FpsWnd extends Wnd {
  private subscription: Pubsub.Subscription
  private stats: typeof Stats

  constructor(wndMgr: WindowManager, private stream: AppEvent.Stream) {
    super(wndMgr, 80, 48, 'Fps')

    const content = document.createElement('div')
    DomUtil.setStyles(content, {
      width: '80px',
      height: '48px',
    })
    this.setContent(content)

    this.stats = new Stats()
    this.stats.domElement.style.position = ''
    content.appendChild(this.stats.domElement)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.START_CALC:
          this.stats.begin()
          break
        case AppEvent.Type.END_CALC:
          this.stats.end()
          break
        }
      })

    wndMgr.add(this)
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }
}

export class PaletWnd extends Wnd {
  private static UNIT = 8
  private static W = 16
  private static H = 2

  private boxes: HTMLElement[]
  private groups: HTMLElement[]
  private palet = new Uint8Array(PaletWnd.W * PaletWnd.H)
  private tmp = new Uint8Array(PaletWnd.W * PaletWnd.H)
  private subscription: Pubsub.Subscription
  private selected = new Uint8Array(PaletWnd.H)

  constructor(wndMgr: WindowManager, private nes: Nes, private stream: AppEvent.Stream) {
    super(wndMgr, PaletWnd.W * PaletWnd.UNIT, PaletWnd.H * PaletWnd.UNIT, 'Palette')

    const {root, boxes, groups} = this.createDom()
    this.setContent(root)
    this.boxes = boxes
    this.groups = groups
    this.selected.fill(0)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })

    this.palet.fill(-1)
    this.render()

    wndMgr.add(this)
  }

  public getSelectedPalets(buf: Uint8Array): void {
    const selected = this.selected
    for (let i = 0; i < selected.length; ++i)
      buf[i] = selected[i]
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private render(): void {
    const tmp = this.tmp
    this.getPalet(tmp)

    const n = PaletWnd.W * PaletWnd.H
    for (let i = 0; i < n; ++i) {
      const c = tmp[i]
      if (c === this.palet[i])
        continue
      this.palet[i] = c

      const cc = kPaletColors[c]
      const r =  cc >> 16
      const g = (cc >>  8) & 0xff
      const b =  cc        & 0xff
      this.boxes[i].style.backgroundColor = `rgb(${r},${g},${b})`
    }
  }

  private getPalet(buf: Uint8Array): void {
    const ppu = this.nes.getPpu()
    const n = PaletWnd.W * PaletWnd.H
    const paletTable = ppu.getPaletTable()
    for (let i = 0; i < n; ++i)
      buf[i] = paletTable[i] & 0x3f
  }

  private createDom(): {root: HTMLElement; boxes: HTMLElement[]; groups: HTMLElement[]} {
    const UNIT = PaletWnd.UNIT, W = PaletWnd.W, H = PaletWnd.H
    const root = document.createElement('div')
    root.className = 'clearfix'
    DomUtil.setStyles(root, {
      width: `${UNIT * W}px`,
      height: `${UNIT * H}px`,
    })

    const boxes = new Array<HTMLElement>(W * H)
    const groups = new Array<HTMLElement>((W / 4) * H)
    for (let i = 0; i < H; ++i) {
      const line = document.createElement('div')
      line.className = 'pull-left clearfix'
      DomUtil.setStyles(line, {
        width: `${UNIT * W}px`,
        height: `${UNIT}px`,
        backgroundColor: 'black',
      })
      root.appendChild(line)

      for (let j = 0; j < W / 4; ++j) {
        const group = document.createElement('div')
        group.className = 'pull-left clearfix'
        DomUtil.setStyles(group, {
          width: `${UNIT * 4}px`,
          height: `${UNIT}px`,
          cursor: 'pointer',
        })
        groups[j + i * (W / 4)] = group
        line.appendChild(group)
        group.addEventListener('click', _event => {
          this.select(i, j)
        })

        for (let k = 0; k < 4; ++k) {
          const box = document.createElement('div')
          box.className = 'pull-left'
          DomUtil.setStyles(box, {
            width: `${UNIT - 1}px`,
            height: `${UNIT - 1}px`,
            marginRight: '1px',
          })
          boxes[(j * 4 + k) + i * W] = box
          group.appendChild(box)
        }
      }
    }
    return {root, boxes, groups}
  }

  private select(i: number, j: number): void {
    this.groups[i * (PaletWnd.W / 4) + this.selected[i]].style.backgroundColor = ''
    this.groups[i * (PaletWnd.W / 4) + j].style.backgroundColor = 'red'
    this.selected[i] = j
  }
}

export class NameTableWnd extends Wnd {
  private ppu: Ppu
  private stream: AppEvent.Stream
  private vert: boolean
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData
  private subscription: Pubsub.Subscription

  public constructor(wndMgr: WindowManager, ppu: Ppu, stream: AppEvent.Stream, vert: boolean) {
    const width = 256 * (vert ? 1 : 2)
    const height = 240 * (vert ? 2 : 1)
    super(wndMgr, width, height, 'NameTable')
    this.ppu = ppu
    this.stream = stream
    this.vert = vert

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    DomUtil.setStyles(canvas, {
      width: `${width}px`,
      height: `${height}px`,
    })
    canvas.className = 'pixelated'
    DomUtil.clearCanvas(canvas)

    this.setContent(canvas)
    this.canvas = canvas

    this.context = DomUtil.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })
    this.render()

    wndMgr.add(this)
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private render(): void {
    const page1X = this.vert ? 0 : 256
    const page1Y = this.vert ? 240 : 0
    PpuDebug.renderNameTable1(this.ppu, this.imageData.data, this.imageData.width, 0, 0, 0)
    PpuDebug.renderNameTable1(this.ppu, this.imageData.data, this.imageData.width,
                              page1X, page1Y, 1)
    this.context.putImageData(this.imageData, 0, 0)
  }
}

export class PatternTableWnd extends Wnd {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private imageData: ImageData
  private subscription: Pubsub.Subscription
  private buf = new Uint8Array(2)

  private static createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 128
    DomUtil.setStyles(canvas, {
      width: '256px',
      height: '128px',
    })
    canvas.className = 'pixelated'
    DomUtil.clearCanvas(canvas)
    return canvas
  }

  public constructor(wndMgr: WindowManager, private ppu: Ppu, private stream: AppEvent.Stream,
                     private getSelectedPalets: (buf: Uint8Array) => boolean) {
    super(wndMgr, 256, 128, 'PatternTable')

    const canvas = PatternTableWnd.createCanvas()
    this.setContent(canvas)
    this.canvas = canvas

    this.context = DomUtil.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })
    this.render()

    wndMgr.add(this)
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private render(): void {
    const buf = this.buf
    this.getSelectedPalets(buf)

    PpuDebug.renderPatternTable(this.ppu, this.imageData.data, this.imageData.width, buf)
    this.context.putImageData(this.imageData, 0, 0)
  }
}

export class GlobalPaletWnd extends Wnd {
  private static UNIT = 12
  private static W = 16
  private static H = 4

  private boxes: HTMLElement[]

  constructor(wndMgr: WindowManager, private onClose?: () => void) {
    super(wndMgr,
          GlobalPaletWnd.W * GlobalPaletWnd.UNIT, GlobalPaletWnd.H * GlobalPaletWnd.UNIT,
          'Global palette')

    const {root, boxes} = this.createDom()
    this.setContent(root)
    this.boxes = boxes

    // Set colors
    const n = this.boxes.length
    for (let i = 0; i < n; ++i) {
      const c = kPaletColors[i]
      const r =  c >> 16
      const g = (c >>  8) & 0xff
      const b =  c        & 0xff
      this.boxes[i].style.backgroundColor = `rgb(${r},${g},${b})`
    }

    wndMgr.add(this)
  }

  public close(): void {
    if (this.onClose != null)
      this.onClose()
    super.close()
  }

  private createDom(): {root: HTMLElement; boxes: HTMLElement[]} {
    const UNIT = GlobalPaletWnd.UNIT, W = GlobalPaletWnd.W, H = GlobalPaletWnd.H
    const root = document.createElement('div')
    root.className = 'clearfix'
    DomUtil.setStyles(root, {
      width: `${UNIT * W}px`,
      height: `${UNIT * H}px`,
    })

    const boxes = new Array<HTMLElement>(W * H)
    for (let i = 0; i < H; ++i) {
      const line = document.createElement('div')
      line.className = 'pull-left clearfix'
      DomUtil.setStyles(line, {
        width: `${UNIT * W}px`,
        height: `${UNIT}px`,
        backgroundColor: 'black',
      })
      root.appendChild(line)

      for (let j = 0; j < W; ++j) {
        const box = document.createElement('div')
        box.className = 'pull-left'
        DomUtil.setStyles(box, {
          width: `${UNIT - 1}px`,
          height: `${UNIT - 1}px`,
          marginRight: '1px',
        })
        boxes[j + i * W] = box
        line.appendChild(box)
      }
    }
    return {root, boxes}
  }
}

const kToneTable = [0, 0.5, 1, 2, 2.5, 3, 3.5, 4, 5, 5.5, 6, 6.5]  // A A# B | C C# D D# E F F# G G#

const kWaveTypeImages: string[] = [
  pluseImg,
  triangleImg,
  '',
  '',
  sawtoothImg,
]

export class AudioWnd extends Wnd {
  private static W = 8
  private static H = 32
  private static OCTAVE = 5

  private static kBaseToneFreq = 440 / Math.pow(2, 3)  // 440Hz - 3 octave
  private static kBaseTone = 12 * Math.log(AudioWnd.kBaseToneFreq) / Math.log(2)

  private nes: Nes
  private stream: AppEvent.Stream
  private subscription: Pubsub.Subscription
  private channelIndices: Array<number>
  private dots: Array<HTMLElement>

  public constructor(wndMgr: WindowManager, nes: Nes, stream: AppEvent.Stream) {
    const waveTypes = nes.getChannelWaveTypes()
    const channelIndices = [...Array(waveTypes.length).keys()]
        .filter(ch => waveTypes[ch] !== WaveType.DMC && waveTypes[ch] !== WaveType.NOISE)
    const channelCount = channelIndices.length

    super(wndMgr, AudioWnd.W * AudioWnd.OCTAVE * 7, AudioWnd.H * channelCount, 'Audio')
    this.nes = nes
    this.stream = stream
    this.channelIndices = channelIndices

    const {root, dots} = this.createDom(channelCount, waveTypes)
    this.setContent(root)
    this.dots = dots

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.RENDER:
          this.render()
          break
        }
      })
    this.render()

    wndMgr.add(this)
  }

  public close(): void {
    this.stream.triggerCloseWnd(this)
    this.subscription.unsubscribe()
    super.close()
  }

  private render(): void {
    const width = (AudioWnd.W * AudioWnd.OCTAVE * 7) | 0
    const h = AudioWnd.H
    const logScale = 12 / Math.log(2)
    const xScale = width / (AudioWnd.OCTAVE * 7)
    const yWhite = (h * 3 / 4) | 0
    const yBlack = (h * 1 / 4) | 0
    const DOT_W = 7
    for (let ich = 0; ich < this.channelIndices.length; ++ich) {
      const ch = this.channelIndices[ich]
      const channel = this.nes.getSoundChannel(ch)
      const dot = this.dots[ich]
      const vol = channel.getVolume()
      const freq = channel.getFrequency()
      const toneIndex = Math.log(freq) * logScale - AudioWnd.kBaseTone + 0.5
      if ((toneIndex >= -1 && toneIndex <= AudioWnd.OCTAVE * 12) || vol <= 0) {
        const offset = kToneTable[(toneIndex | 0) % 12]
        const x = (offset + ((toneIndex / 12) | 0) * 7 + (toneIndex % 1)) * xScale
        const y = (offset | 0) === offset ? yWhite : yBlack
        DomUtil.setStyles(dot, {
          left: `${x - DOT_W / 2}px`,
          top: `${y - DOT_W / 2}px`,
          opacity: `${Math.pow(vol, 1 / 4)}`,
        })
      } else {
        DomUtil.setStyles(dot, {
          opacity: '0',
        })
      }
    }
  }

  private createDom(channelCount: number, waveTypes: WaveType[]):
      {root: HTMLElement; dots: HTMLElement[]}
  {
    const W = AudioWnd.W, H = AudioWnd.H
    const root = document.createElement('div')
    const width = W * AudioWnd.OCTAVE * 7
    const height = H * channelCount
    root.className = 'clearfix'
    DomUtil.setStyles(root, {
      width: `${width}px`,
      height: `${height}px`,
      position: 'relative',
      overflow: 'hidden',
    })

    const kBlackKeys = [0, 2, 3, 5, 6]

    const DOT_W = 7
    const dots = new Array<HTMLElement>(channelCount)

    for (let ch = 0; ch < channelCount; ++ch) {
      const line = document.createElement('div')
      line.className = 'keyboard'
      DomUtil.setStyles(line, {
        height: `${H - 1}px`,
      })
      root.appendChild(line)

      for (let note = 0; note < AudioWnd.OCTAVE * 7; ++note) {
        const whiteKey = document.createElement('div')
        whiteKey.className = 'white-key'
        DomUtil.setStyles(whiteKey, {
          left: `${note * W}px`,
          width: `${W - 1}px`,
        })
        line.appendChild(whiteKey)
      }

      for (let octave = -1; octave < AudioWnd.OCTAVE; ++octave) {
        const start = octave >= 0 ? 0 : kBlackKeys.length - 1
        for (let i = start; i < kBlackKeys.length; ++i) {
          const note = octave * 7 + kBlackKeys[i]
          const blackKey = document.createElement('div')
          blackKey.className = 'black-key'
          DomUtil.setStyles(blackKey, {
            left: `${note * W + W / 2 + 1}px`,
            width: `${W - 2}px`,
            height: `${H / 2}px`,
          })
          line.appendChild(blackKey)
        }
      }

      const icon = document.createElement('img')
      DomUtil.setStyles(icon, {
        position: 'absolute',
        left: 0,
        top: 0,
        display: 'block',
      })
      const waveType = waveTypes[this.channelIndices[ch]]
      icon.src = kWaveTypeImages[waveType]
      line.appendChild(icon)

      const dot = document.createElement('div')
      dot.className = 'note'
      DomUtil.setStyles(dot, {
        width: `${DOT_W}px`,
        height: `${DOT_W}px`,
        borderRadius: `${DOT_W}px`,
      })
      line.appendChild(dot)
      dots[ch] = dot
    }

    return {root, dots}
  }
}

export class EqualizerWnd extends Wnd {
  private analyserNode: AnalyserNode
  private dataArray: Uint8Array

  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private mode = 0

  constructor(wndMgr: WindowManager, private onClose: () => void) {
    super(wndMgr, 256, 128, 'Equalizer')

    const width = 256
    const height = 128

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    DomUtil.setStyles(canvas, {
      width: `${width}px`,
      height: `${height}px`,
    })
    canvas.className = 'pixelated'
    DomUtil.clearCanvas(canvas)

    this.setContent(canvas)
    this.canvas = canvas
    this.context = DomUtil.getCanvasContext2d(this.canvas)

    this.canvas.addEventListener('click', () => {
      this.mode = 1 - this.mode
    })

    if (!this.setUp()) {
      const div = document.createElement('div')
      div.innerText = 'No audio'
      DomUtil.setStyles(div, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        color: 'red',
      })
      this.getContentHolder().appendChild(div)
    }

    wndMgr.add(this)
  }

  public close(): void {
    this.onClose()
    super.close()
  }

  public onEvent(event: WndEvent, _param?: any): any {
    switch (event) {
    case WndEvent.UPDATE_FRAME:
      this.render()
      break
    }
  }

  private setUp(): boolean {
    if (this.analyserNode != null)
      return false

    const analyserNode = AudioManager.createAnalyser()
    if (analyserNode == null)
      return false

    this.analyserNode = analyserNode

    this.analyserNode.fftSize = 256
    const bufferLength = this.analyserNode.frequencyBinCount
    this.dataArray = new Uint8Array(bufferLength)
    return true
  }

  private render(): void {
    if (this.dataArray == null)
      return

    switch (this.mode) {
    case 0:
      this.renderFrequency()
      break
    case 1:
      this.renderTimeDomain()
      break
    }
  }

  private renderFrequency(): void {
    const canvasCtx = this.context
    const WIDTH = 256, HEIGHT = 128

    const dataArray = this.dataArray
    const bufferLength = dataArray.length
    this.analyserNode.getByteFrequencyData(dataArray)

    canvasCtx.fillStyle = 'rgb(0, 0, 0)'
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT)

    const barWidth = 4
    let x = 0

    canvasCtx.fillStyle = 'rgb(0,255,64)'
    const n = ((WIDTH + barWidth - 1) / barWidth) | 0
    for (let i = 0; i < n; ++i) {
      const barHeight = (dataArray[(i * bufferLength / n) | 0] * HEIGHT / 255) | 0
      canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth - 1, barHeight)
      x += barWidth
    }
  }

  private renderTimeDomain(): void {
    const dataArray = this.dataArray
    const bufferLength = dataArray.length
    this.analyserNode.getByteTimeDomainData(dataArray)

    this.context.fillStyle = 'rgb(0, 0, 0)'
    this.context.fillRect(0, 0, 256, 128)

    const canvasCtx = this.context
    const WIDTH = 256, HEIGHT = 128

    canvasCtx.strokeStyle = 'rgb(255,255,255)'
    canvasCtx.beginPath()
    for (let i = 0; i < bufferLength; ++i) {
      const y = (HEIGHT / 2) - (((dataArray[i] - 128) * HEIGHT / 128) | 0)
      const x = i * WIDTH / bufferLength
      if (i === 0)
        canvasCtx.moveTo(x, y)
      else
        canvasCtx.lineTo(x, y)
    }
    canvasCtx.stroke()
  }
}

export class AboutWnd extends Wnd {
  constructor(wndMgr: WindowManager, private onClose: () => void) {
    super(wndMgr, 200, 128, 'About')

    const root = document.createElement('div')
    root.className = 'full-size'
    DomUtil.setStyles(root, {
      background: 'white',
    })

    root.innerHTML = aboutHtmlContent

    this.setContent(root)

    wndMgr.add(this)
    wndMgr.moveToCenter(this)
  }

  public close(): void {
    this.onClose()
    super.close()
  }
}

export class SettingWnd extends Wnd {
  protected valueElems = new Array<HTMLInputElement>()

  public constructor(wndMgr: WindowManager, private onClose: () => void) {
    super(wndMgr, 256, 160, 'Setting')

    const content = this.createContent()
    this.setContent(content)

    wndMgr.add(this)
  }

  public close(): void {
    this.onClose()
    super.close()
  }

  protected createContent(): HTMLElement {
    const container = document.createElement('div')
    DomUtil.setStyles(container, {
      padding: '8px',
    })

    const enum Type {
      CHECKBOX,
      RANGE,
    }

    const table = [
      {
        type: Type.CHECKBOX,
        message: 'Pause on menu',
        getValue: () => GlobalSetting.pauseOnMenu,
        onchange(_event: Event) {
          GlobalSetting.pauseOnMenu = !!(this as any).checked
          GlobalSetting.saveToStorage()
        },
      },
      {
        type: Type.CHECKBOX,
        message: 'Mute on inactive',
        getValue: () => GlobalSetting.muteOnInactive,
        onchange(_event: Event) {
          GlobalSetting.muteOnInactive = (this as any).checked
          GlobalSetting.saveToStorage()
        },
      },
      {
        type: Type.RANGE,
        message: 'Volume',
        max: 100,
        getValue: () => GlobalSetting.volume,
        onchange(_event: Event) {
          const volume = ((this as any).value) / 100
          AudioManager.setMasterVolume(volume)
          GlobalSetting.volume = volume
        },
        onfinish(_event: Event) {
          GlobalSetting.saveToStorage()
        },
      },
    ]
    for (const elem of table) {
      const row = document.createElement('div')
      switch (elem.type) {
      case Type.CHECKBOX:
        {
          const input = document.createElement('input')
          input.type = 'checkbox'
          input.id = elem.message
          input.checked = elem.getValue() as boolean
          input.onchange = elem.onchange!
          row.appendChild(input)

          const label = document.createElement('label')
          label.setAttribute('for', elem.message)
          const text = document.createTextNode(elem.message)
          label.appendChild(text)
          row.appendChild(label)
        }
        break
      case Type.RANGE:
        {
          const text = document.createTextNode(elem.message)
          row.appendChild(text)

          const input = document.createElement('input')
          input.type = 'range'
          input.oninput = elem.onchange!
          input.onmouseup = elem.onfinish!
          input.ontouchend = elem.onfinish!
          if (elem.max)
            input.max = elem.max.toString()
          input.value = ((elem.getValue() as number) * 100).toString()
          row.appendChild(input)
        }
        break
      }
      container.append(row)
    }

    const root = document.createElement('div')
    root.className = 'full-size'
    DomUtil.setStyles(root, {
      backgroundColor: 'white',
    })
    root.append(container)
    return root
  }
}
