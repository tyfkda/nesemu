import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'

import {AudioManager} from '../util/audio_manager'
import {WaveType, INoiseChannel} from '../nes/apu'
import {DomUtil} from '../util/dom_util'
import {GlobalSetting} from './global_setting'
import {Nes} from '../nes/nes'
import {Ppu} from '../nes/ppu/ppu'
import {PpuDebug} from './ppu_debug'
import {kPaletColors} from '../nes/ppu/const'
import {Persistor} from '../util/persist'

import {AppEvent} from './app_event'
import {Util} from '../util/util'

import * as Pubsub from '../util/pubsub'
import {default as Stats} from 'stats-js'

import aboutHtmlContent from '../res/about.html?inline'
import githubLogoSvg from '../res/github-logo.svg?raw'

import pluseImg from '../res/pulse.png'
import triangleImg from '../res/triangle.png'
import noiseImg from '../res/noise.png'
import dmcImg from '../res/dmc.png'
import sawtoothImg from '../res/sawtooth.png'

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

    this.addResizeBox({
      minWidth: PaletWnd.UNIT * PaletWnd.W,
      minHeight: PaletWnd.UNIT * PaletWnd.H,
      cornerOnly: true,
    })

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
    const W = PaletWnd.W, H = PaletWnd.H
    const root = document.createElement('div')
    root.className = 'full-size'
    DomUtil.setStyles(root, {
      display: 'flex',
      flexFlow: 'column',
    })

    const boxes = new Array<HTMLElement>(W * H)
    const groups = new Array<HTMLElement>((W / 4) * H)
    for (let i = 0; i < H; ++i) {
      const line = document.createElement('div')
      DomUtil.setStyles(line, {
        width: '100%',
        backgroundColor: 'black',
        flex: '1',
        display: 'flex',
      })
      root.appendChild(line)

      for (let j = 0; j < W / 4; ++j) {
        const group = document.createElement('div')
        DomUtil.setStyles(group, {
          cursor: 'pointer',
          flex: '1',
          display: 'flex',
        })
        groups[j + i * (W / 4)] = group
        line.appendChild(group)
        group.addEventListener('click', _event => this.select(i, j))

        for (let k = 0; k < 4; ++k) {
          const box = document.createElement('div')
          DomUtil.setStyles(box, {
            marginRight: '1px',
            marginBottom: '1px',
            flex: 1,
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
    canvas.className = 'pixelated full-size fit-fill'
    DomUtil.clearCanvas(canvas)

    this.setContent(canvas)
    this.canvas = canvas

    this.context = DomUtil.getCanvasContext2d(this.canvas)
    this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)

    this.addResizeBox()

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
    canvas.className = 'pixelated full-size fit-fill'
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

    this.addResizeBox({
      minWidth: 256 / 2,
      minHeight: 128 / 2,
    })

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

    this.addResizeBox({
      minWidth: GlobalPaletWnd.UNIT * GlobalPaletWnd.W,
      minHeight: GlobalPaletWnd.UNIT * GlobalPaletWnd.H,
    })

    wndMgr.add(this)
  }

  public close(): void {
    if (this.onClose != null)
      this.onClose()
    super.close()
  }

  private createDom(): {root: HTMLElement; boxes: HTMLElement[]} {
    const W = GlobalPaletWnd.W, H = GlobalPaletWnd.H
    const root = document.createElement('div')
    root.className = 'clearfix'
    DomUtil.setStyles(root, {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexFlow: 'column',
    })

    const boxes = new Array<HTMLElement>(W * H)
    for (let i = 0; i < H; ++i) {
      const line = document.createElement('div')
      line.className = 'pull-left clearfix'
      DomUtil.setStyles(line, {
        width: '100%',
        backgroundColor: 'black',
        flex: '1',
        display: 'flex',
      })
      root.appendChild(line)

      for (let j = 0; j < W; ++j) {
        const box = document.createElement('div')
        box.className = 'pull-left'
        DomUtil.setStyles(box, {
          marginRight: '1px',
          marginBottom: '1px',
          flex: '1',
        })
        boxes[j + i * W] = box
        line.appendChild(box)
      }
    }
    return {root, boxes}
  }
}

const kToneTable: number[] = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]  // F F# G G# A A# B C C# D D# E

const kWaveTypeImages: string[] = [
  pluseImg,
  triangleImg,
  noiseImg,
  dmcImg,
  sawtoothImg,
]

const WHITE_NOTE = 7  // A, B, C, D, E, F, G
const ALL_NOTE = 12
const KEY_FLASH_COLOR = '#0ef'

export class AudioWnd extends Wnd {
  private static W = 8
  private static H = 32
  private static OCTAVE = 6

  private static kBaseToneFreq = 43.65  // F1
  private static kBaseTone = ALL_NOTE * Math.log(AudioWnd.kBaseToneFreq) / Math.log(2)

  private nes: Nes
  private stream: AppEvent.Stream
  private subscription: Pubsub.Subscription
  private waveTypes: Array<WaveType>
  private channelIndices: Array<number>
  private dots: Array<HTMLElement>
  private keys: Array<Array<HTMLElement>>
  private lastKeyIndices: Int32Array

  public constructor(wndMgr: WindowManager, nes: Nes, stream: AppEvent.Stream) {
    const waveTypes = nes.getChannelWaveTypes()
    const channelIndices = [...Array(waveTypes.length).keys()]
    const channelCount = channelIndices.length

    // Assumed noise and DMC channels exist and they are half height.
    super(wndMgr, AudioWnd.W * AudioWnd.OCTAVE * 7, AudioWnd.H * (channelCount - 1), 'Audio')
    this.nes = nes
    this.stream = stream
    this.waveTypes = waveTypes
    this.channelIndices = channelIndices

    const {root, dots, keys} = this.createDom(channelCount, waveTypes)
    this.setContent(root)
    this.dots = dots
    this.keys = keys

    this.lastKeyIndices = new Int32Array(channelCount)
    this.lastKeyIndices.fill(-1)

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
    const h = AudioWnd.H
    const logScale = ALL_NOTE / Math.log(2)
    const xScale = AudioWnd.W
    const yWhite = (h * 3 / 4) | 0
    const yBlack = (h * 1 / 4) | 0
    const DOT_W = 12
    for (let ich = 0; ich < this.channelIndices.length; ++ich) {
      const channel = this.nes.getSoundChannel(this.channelIndices[ich])
      const waveType = this.waveTypes[ich]
      let x = 0
      let y = 0
      let vol = 0

      switch (waveType) {
      case WaveType.NOISE:
        {
          vol = channel.isEnabled() ? channel.getVolume() : 0
          const [period, _mode] = (channel as unknown as INoiseChannel).getNoisePeriod()
          const APU_NOISE_HZ = 894887
          const freq = (APU_NOISE_HZ / 32) / (period + 1)  // ???
          const toneIndex = Math.log(freq) * logScale - AudioWnd.kBaseTone + 0.5
          if ((toneIndex >= 0 && toneIndex <= AudioWnd.OCTAVE * ALL_NOTE) && vol > 0) {
            const offset = kToneTable[(toneIndex | 0) % ALL_NOTE] | 0
            x = Math.round(((offset * 0.5) + (Math.floor(toneIndex / ALL_NOTE) | 0) * WHITE_NOTE + (toneIndex % 1)) * xScale) | 0
            y = AudioWnd.H * 0.25
          } else {
            vol = 0
          }
        }
        break
      case WaveType.DMC:
        {
          vol = channel.isEnabled() ? channel.getVolume() : 0
          x = (AudioWnd.W * AudioWnd.OCTAVE * 7) * 0.5
          y = AudioWnd.H * 0.25
        }
        break
      default:
        {
          vol = channel.isEnabled() ? channel.getVolume() : 0
          const freq = channel.getFrequency()
          const toneIndex = Math.log(freq) * logScale - AudioWnd.kBaseTone + 0.5
          let keyIndex = -1
          if ((toneIndex >= 0 && toneIndex <= AudioWnd.OCTAVE * ALL_NOTE) && vol > 0) {
            const offset = kToneTable[(toneIndex | 0) % ALL_NOTE] | 0
            x = Math.round(((offset * 0.5) + (Math.floor(toneIndex / ALL_NOTE) | 0) * WHITE_NOTE + (toneIndex % 1)) * xScale) | 0
            y = (offset & 1) === 0 ? yWhite : yBlack
            keyIndex = Math.floor(toneIndex) | 0
          }

          const lastKeyIndex = this.lastKeyIndices[ich]
          if (keyIndex !== lastKeyIndex) {
            if (lastKeyIndex >= 0) {
              const key = this.keys[ich][lastKeyIndex]
              key.style.removeProperty('background-color')
            }
            if (keyIndex >= 0) {
              const key = this.keys[ich][keyIndex]
              key.style.setProperty('background-color', KEY_FLASH_COLOR)
            }
            this.lastKeyIndices[ich] = keyIndex
          }
        }
        break
      }

      const dot = this.dots[ich]
      if (vol > 0) {
        const v = Math.pow(vol, 1 / 3)
        const w = Math.round(DOT_W * v) | 0
        const r = (w * 0.5) | 0
        DomUtil.setStyles(dot, {
          left: `${x - r}px`,
          top: `${y - r}px`,
          visibility: 'visible',
          width: `${w}px`,
          height: `${w}px`,
          borderRadius: `${w}px`,
        })
      } else {
        DomUtil.setStyles(dot, {
          visibility: 'hidden',
        })
      }
    }
  }

  private createDom(channelCount: number, waveTypes: WaveType[]):
      {root: HTMLElement; dots: Array<HTMLElement>, keys: Array<Array<HTMLElement>>}
  {
    const W = AudioWnd.W, H = AudioWnd.H
    const root = document.createElement('div')
    const width = W * AudioWnd.OCTAVE * WHITE_NOTE
    const height = H * channelCount
    DomUtil.setStyles(root, {
      width: `${width}px`,
      height: `${height}px`,
      position: 'relative',
      overflow: 'hidden',
    })

    const dots = new Array<HTMLElement>(channelCount)
    const keys = new Array<Array<HTMLElement>>(channelCount)

    for (let ch = 0; ch < channelCount; ++ch) {
      const line = document.createElement('div')
      const waveType = waveTypes[this.channelIndices[ch]]
      const percussion = waveType === WaveType.NOISE || waveType === WaveType.DMC
      const h = percussion ? H / 2 : H
      line.className = 'keyboard'
      DomUtil.setStyles(line, {
        height: `${h - 1}px`,
      })

      let whiteKeys: Array<HTMLElement>
      let blackKeys: Array<HTMLElement>
      let chKeys: Array<HTMLElement> = []
      if (!percussion) {
        whiteKeys = new Array<HTMLElement>()
        blackKeys = new Array<HTMLElement>()
        chKeys = new Array<HTMLElement>()
        for (let octave = 0; octave < AudioWnd.OCTAVE; ++octave) {
          for (let i = 0; i < kToneTable.length; ++i) {
            const offset = kToneTable[i] | 0
            const note = octave * WHITE_NOTE + (offset >> 1)
            let key: HTMLElement
            if ((offset & 1) === 0) {
              key = document.createElement('div')
              key.className = 'white-key'
              DomUtil.setStyles(key, {
                left: `${note * W}px`,
                width: `${W - 1}px`,
              })
              whiteKeys.push(key)
            } else {
              key = document.createElement('div')
              key.className = 'black-key'
              DomUtil.setStyles(key, {
                left: `${note * W + W / 2 + 1}px`,
                width: `${W - 2}px`,
                height: `${H / 2}px`,
              })
              blackKeys.push(key)
            }
            chKeys.push(key)
          }
        }

        for (const whiteKey of whiteKeys)
          line.appendChild(whiteKey)
        for (const blackKey of blackKeys)
          line.appendChild(blackKey)
      }

      const icon = document.createElement('img')
      icon.className = 'pixelated'
      DomUtil.setStyles(icon, {
        position: 'absolute',
        left: 0,
        top: 0,
        display: 'block',
      })
      icon.src = kWaveTypeImages[waveType]
      line.appendChild(icon)

      const dot = document.createElement('div')
      dot.className = 'note'
      DomUtil.setStyles(dot, {
        visibility: 'hidden',
      })
      line.appendChild(dot)
      dots[ch] = dot
      keys[ch] = chKeys

      const mask = document.createElement('div')
      DomUtil.setStyles(mask, {
        position: 'absolute',
        display: 'none',
        width: '100%',
        height: '100%',
        top: '0',
        left: '0',
        backgroundColor: 'rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      })
      line.appendChild(mask)
      line.addEventListener('click', (_ev) => {
        const channelActive = mask.style.display !== 'none'
        mask.style.display = channelActive ? 'none' : 'inherit'
        this.stream.triggerEnableAudioChannel(this.channelIndices[ch], channelActive)
      })

      root.appendChild(line)
    }

    return {root, dots, keys}
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

    const img = root.querySelector('img#github-logo')
    if (img != null) {
      img.setAttribute('src', `data:image/svg+xml;base64,${btoa(githubLogoSvg)}`)
    }

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
        message: 'Persist cartridges',
        getValue: () => GlobalSetting.persistCarts,
        onchange(_event: Event) {
          GlobalSetting.persistCarts = !!(this as any).checked

          // Regardless of setting or unsetting,
          // we want a clean slate when we're changed.
          Persistor.clearAllPersists()
        },
      },
      {
        type: Type.CHECKBOX,
        message: 'Pause on menu',
        getValue: () => GlobalSetting.pauseOnMenu,
        onchange(_event: Event) {
          GlobalSetting.pauseOnMenu = !!(this as any).checked
        },
      },
      {
        type: Type.CHECKBOX,
        message: 'Mute on inactive',
        getValue: () => GlobalSetting.muteOnInactive,
        onchange(_event: Event) {
          GlobalSetting.muteOnInactive = (this as any).checked
        },
      },
      {
        type: Type.RANGE,
        message: 'Volume',
        max: 100,
        getValue: () => Math.round(GlobalSetting.volume * 100).toString(),
        onchange(_event: Event) {
          const volume = ((this as any).value) / 100
          AudioManager.setMasterVolume(volume)
          GlobalSetting.volume = volume
        },
        onfinish(_event: Event) {
        },
      },
      {
        type: Type.RANGE,
        message: () => {
          const speed = Math.round(GlobalSetting.emulationSpeed * 100) | 0
          const frac = `${speed % 100}`.padStart(2, '0')
          return `Speed ${(speed / 100) | 0}.${frac}`
        },
        max: 6,
        getValue: () => {
          const speed = GlobalSetting.emulationSpeed
          const index = Util.clamp(Math.round((speed - 0.5) / 0.25), 0, 6)
          return index.toString()
        },
        onchange(_event: Event) {
          const speedIndex = parseInt((this as any).value)
          GlobalSetting.emulationSpeed = speedIndex * 0.25 + 0.5
        },
      },
    ]

    function getMessage(message: string | (() => string)): string {
      if (typeof(message) === 'string')
        return message
      else
        return message()
    }

    for (const elem of table) {
      const row = document.createElement('div')
      switch (elem.type) {
      case Type.CHECKBOX:
        {
          const message = getMessage(elem.message)
          const input = document.createElement('input')
          input.type = 'checkbox'
          input.id = message
          input.checked = elem.getValue() as boolean
          input.onchange = elem.onchange!
          row.appendChild(input)

          const label = document.createElement('label')
          label.setAttribute('for', message)
          const text = document.createTextNode(message)
          label.appendChild(text)
          row.appendChild(label)
        }
        break
      case Type.RANGE:
        {
          const message = getMessage(elem.message)
          const text = document.createTextNode(message)
          row.appendChild(text)

          const input = document.createElement('input')
          input.type = 'range'
          if (typeof(elem.message) === 'string') {
            input.oninput = elem.onchange!
          } else {
            input.oninput = function(ev) {
              if (elem.onchange != null)
                elem.onchange.call(this, ev)
              text.textContent = getMessage(elem.message)
            }
          }
          input.onmouseup = elem.onfinish!
          input.ontouchend = elem.onfinish!
          if (elem.max)
            input.max = elem.max.toString()
          input.value = elem.getValue() as string
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
