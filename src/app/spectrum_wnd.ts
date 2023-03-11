import {WindowManager} from '../wnd/window_manager'
import {Wnd} from '../wnd/wnd'
import {WndEvent} from '../wnd/types'

import {AudioManager} from '../util/audio_manager'
import {DomUtil} from '../util/dom_util'

const WIDTH = 360
const HEIGHT = 120

const PEAK_WAIT0 = 30
const PEAK_WAIT1 = 2

// Colors
const GREEN = 'rgb(0,224,64)'
const YELLOW = 'rgb(224,224,0)'
const RED = 'rgb(224,0,0)'
const GRAY = 'rgb(40,40,40)'

const minHz = 100
const maxHz = 10000
const minHzVal = Math.log10(minHz)
const maxHzVal = Math.log10(maxHz)

const enum Mode {
  LED,
  DETAIL,
  RAW,
}

export class SpectrumWnd extends Wnd {
  private analyserNode: AnalyserNode
  private dataArray: Uint8Array

  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private mode = Mode.LED

  private freqBinIndices: Array<number>
  private peakAmplitude: Array<number>
  private peakWait: Array<number>
  private xBinTable: Int32Array

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
      this.mode = this.mode < Mode.RAW ? this.mode + 1 : Mode.LED
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

    this.analyserNode.fftSize = 2048
    this.analyserNode.maxDecibels = -30;
    this.analyserNode.minDecibels = -70;
    this.analyserNode.smoothingTimeConstant = 0.0
    const bufferLength = this.analyserNode.frequencyBinCount
    this.dataArray = new Uint8Array(bufferLength)

    const calcBin = (e: number) => {
      const freq = 10 ** e
      return (freq * bufferLength / (sampleRate * 0.5)) | 0
    }

    const DIV = 20
    this.freqBinIndices = [...Array(DIV + 1)].map((_, i) =>
        calcBin(i / DIV * (maxHzVal - minHzVal) + minHzVal))
    this.peakAmplitude = [...Array(WIDTH)].map(_ => 0)
    this.peakWait = [...Array(WIDTH)].map(_ => 0)
    this.xBinTable = new Int32Array([...Array(WIDTH + 1)].map((_, i) =>
        calcBin(i / WIDTH * (maxHzVal - minHzVal) + minHzVal)))

    return true
  }

  private render(): void {
    this.context.fillStyle = 'rgb(0, 0, 0)'
    this.context.fillRect(0, 0, WIDTH, HEIGHT)

    if (this.dataArray == null)
      return

    switch (this.mode) {
    case Mode.LED:
      this.renderLed()
      break
    case Mode.DETAIL:
      this.renderDetail()
      break
    case Mode.RAW:
      this.renderTimeDomain()
      break
    }
  }

  private renderLed(): void {
    const canvasCtx = this.context

    const dataArray = this.dataArray
    this.analyserNode.getByteFrequencyData(dataArray)

    const n = this.freqBinIndices.length - 1
    const barWidth = (WIDTH / n) | 0
    const YDIV = 20
    const H = HEIGHT / YDIV
    const scale = YDIV / 255

    for (let i = 0; i < n; ++i) {
      let bin = this.freqBinIndices[i]
      let max = dataArray[bin]
      const nextBin = this.freqBinIndices[i + 1]
      while (++bin < nextBin)
        max = Math.max(max, dataArray[bin])

      const h = Math.min(max * scale, YDIV) | 0
      const x = i * WIDTH / n
      for (let j = 0; j < YDIV; ++j) {
        canvasCtx.fillStyle = j >= h ? GRAY : j < YDIV - 4 ? GREEN : j < YDIV - 1 ? YELLOW : RED
        const y = (HEIGHT - H) - j * H
        canvasCtx.beginPath()
        canvasCtx.roundRect(x, y, barWidth - 1, H - 1, 2)
        canvasCtx.fill()
      }

      let h2 = this.peakAmplitude[i]
      if (h2 > YDIV)
        h2 = 0
      if (h >= h2) {
        this.peakAmplitude[i] = h
        this.peakWait[i] = PEAK_WAIT0
      } else if (h2 > 0) {
        const hh = h2 - 1
        if (hh >= h) {
          canvasCtx.fillStyle = hh < YDIV - 4 ? GREEN : hh < YDIV - 1 ? YELLOW : RED
          const y = (HEIGHT - H) - hh * H
          canvasCtx.beginPath()
          canvasCtx.roundRect(x, y, barWidth - 1, H - 1, 2)
          canvasCtx.fill()
        }

        if (--this.peakWait[i] <= 0) {
          this.peakAmplitude[i] = h2 - 1
          this.peakWait[i] = PEAK_WAIT1
        }
      }
    }
  }

  private renderDetail(): void {
    const canvasCtx = this.context

    const dataArray = this.dataArray
    this.analyserNode.getByteFrequencyData(dataArray)

    const scale = HEIGHT / 255
    const gravity = HEIGHT / (32 * 32)

    for (let i = 0; i < WIDTH; ++i) {
      // Bar.
      let bin = this.xBinTable[i]
      let v = dataArray[bin]
      for (const nextBin = this.xBinTable[i + 1]; ++bin < nextBin; )
        v = Math.max(v, dataArray[bin])

      const h = (v * scale) | 0
      const x = i
      canvasCtx.fillStyle = `rgb(${v>>2},${v},${160-(v>>1)})`
      canvasCtx.fillRect(x, HEIGHT - h, 1, h)

      // Peak.
      const py = this.peakAmplitude[i]
      if (h >= py) {
        this.peakAmplitude[i] = h
        this.peakWait[i] = 0
      } else if (py > 0) {
        this.peakWait[i] -= gravity
        this.peakAmplitude[i] += this.peakWait[i]

        const v = (py / scale) | 0
        canvasCtx.fillStyle = `rgb(0,${(v>>2)+192},${v>>1})`
        canvasCtx.fillRect(x, HEIGHT - py, 1, 1)
      }
    }
  }

  private renderTimeDomain(): void {
    const sampleRate = this.analyserNode.context.sampleRate
    const dataArray = this.dataArray
    const bufferLength = Math.min(dataArray.length, (sampleRate * (1.0 / 300)) | 0)
    this.analyserNode.getByteTimeDomainData(dataArray)

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
