import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'
import {WndEvent} from '../wnd/types'

import {AudioManager} from '../util/audio_manager'
import {DomUtil} from '../util/dom_util'

const WIDTH = 360
const HEIGHT = 120

const FreqTable = [
  6,
  (31.5 + 63) / 2,
  (63 + 94) / 2,
  (94 + 126) / 2,
  (126 + 170) / 2,
  (170 + 230) / 2,
  (230 + 310) / 2,
  (310 + 420) / 2,
  (420 + 563) / 2,
  (563 + 760) / 2,
  (760 + 1000) / 2,
  (1000 + 1370) / 2,
  (1370 + 1870) / 2,
  (1870 + 2550) / 2,
  (2550 + 3400) / 2,
  (3400 + 4600) / 2,
  (4600 + 6150) / 2,
  (6150 + 8360) / 2,
  (8360 + 11200) / 2,
  (11200 + 15000) / 2,
  20000,
]

const PEEK_WAIT0 = 30
const PEEK_WAIT1 = 2

// Colors
const GREEN = 'rgb(0,224,64)'
const YELLOW = 'rgb(224,224,0)'
const RED = 'rgb(224,0,0)'
const GRAY = 'rgb(40,40,40)'

function calcBin(f: number, bufferLength: number, sampleRate: number): number {
  return (f * bufferLength * 2 / sampleRate) | 0
}

export class SpectrumWnd extends Wnd {
  private analyserNode: AnalyserNode
  private dataArray: Uint8Array
  private floatArray: Float32Array

  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private mode = 0

  private freqBinIndices: Array<number>
  private peekAmplitude: Array<number>
  private peekWait: Array<number>

  constructor(wndMgr: WindowManager, private onClose: () => void) {
    super(wndMgr, WIDTH, HEIGHT, 'Spectrum Analyzer')

    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    DomUtil.setStyles(canvas, {
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
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
    const sampleRate = analyserNode.context.sampleRate

    this.analyserNode.fftSize = 2048  //256
    this.analyserNode.maxDecibels = -30;
    this.analyserNode.minDecibels = -70;
    const bufferLength = this.analyserNode.frequencyBinCount
    this.floatArray = new Float32Array(bufferLength)
    this.dataArray = new Uint8Array(Math.min(this.analyserNode.fftSize,
                                             ((1.0 / 300) * sampleRate) | 0))

    this.freqBinIndices = FreqTable.map((f) => calcBin(f, bufferLength, sampleRate))
    this.peekAmplitude = [...Array(FreqTable.length - 1)].map(_ => 0)
    this.peekWait = [...Array(FreqTable.length - 1)].map(_ => 0)

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

    const dataArray = this.floatArray
    this.analyserNode.getFloatFrequencyData(dataArray)

    canvasCtx.fillStyle = 'rgb(0, 0, 0)'
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT)

    const n = this.freqBinIndices.length - 1
    const barWidth = (WIDTH / n) | 0
    const minDecibels = this.analyserNode.minDecibels
    const YDIV = 20
    const H = HEIGHT / YDIV
    const scale = YDIV / (this.analyserNode.maxDecibels - minDecibels)

    let bin = this.freqBinIndices[0]
    for (let i = 0; i < n; ++i) {
      const nextBin = this.freqBinIndices[i + 1]
      let max = minDecibels
      for (let j = bin; j < nextBin; ++j) {
        max = Math.max(max, dataArray[j])
      }
      bin = nextBin
      const h = Math.min((max - minDecibels) * scale, YDIV) | 0
      const x = i * WIDTH / n
      for (let j = 0; j < YDIV; ++j) {
        canvasCtx.fillStyle = j >= h ? GRAY : j < YDIV - 4 ? GREEN : j < YDIV - 1 ? YELLOW : RED
        const y = (HEIGHT - H) - j * H
        canvasCtx.beginPath()
        canvasCtx.roundRect(x, y, barWidth - 1, H - 1, 2)
        canvasCtx.fill()
      }

      const h2 = this.peekAmplitude[i]
      if (h >= h2) {
        this.peekAmplitude[i] = h
        this.peekWait[i] = PEEK_WAIT0
      } else if (h2 > 0) {
        const hh = h2 - 1
        if (hh >= h) {
          canvasCtx.fillStyle = hh < YDIV - 4 ? GREEN : hh < YDIV - 1 ? YELLOW : RED
          const y = (HEIGHT - H) - hh * H
          canvasCtx.beginPath()
          canvasCtx.roundRect(x, y, barWidth - 1, H - 1, 2)
          canvasCtx.fill()
        }

        if (--this.peekWait[i] <= 0) {
          this.peekAmplitude[i] = h2 - 1
          this.peekWait[i] = PEEK_WAIT1
        }
      }
    }
  }

  private renderTimeDomain(): void {
    const dataArray = this.dataArray
    const bufferLength = dataArray.length
    this.analyserNode.getByteTimeDomainData(dataArray)

    this.context.fillStyle = 'rgb(0, 0, 0)'
    this.context.fillRect(0, 0, WIDTH, HEIGHT)

    const canvasCtx = this.context

    canvasCtx.strokeStyle = 'rgb(255,255,255)'
    canvasCtx.beginPath()
    canvasCtx.moveTo(0, HEIGHT / 2)
    for (let i = 0; i < bufferLength; ++i) {
      const y = (HEIGHT / 2) - (((dataArray[i] - 128) * HEIGHT / 128) | 0)
      const x = (i + 1) * WIDTH / bufferLength
      canvasCtx.lineTo(x, y)
    }
    canvasCtx.stroke()
  }
}
