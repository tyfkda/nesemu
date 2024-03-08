// Horizontal line event, used in PPU.

import {Const} from '../const'

const kInitialPalette = Uint8Array.from([
  0x09, 0x01, 0x00, 0x01, 0x00, 0x02, 0x02, 0x0d, 0x08, 0x10, 0x08, 0x24, 0x00, 0x00, 0x04, 0x2c,
  0x09, 0x01, 0x34, 0x03, 0x00, 0x04, 0x00, 0x14, 0x08, 0x3a, 0x00, 0x02, 0x00, 0x20, 0x2c, 0x08,
])

export const enum HEventType {
  DUMMY,
  PPU_CTRL,
  PPU_MASK,
  CHR_BANK_OFFSET,
  MIRROR_MODE_BIT,
  SCROLL_CURR,
  SCROLL_FINE_X,
  PALET,
}

interface HEvent {
  type: HEventType
  hcount: number
  value: number
  index: number
}

class HEventBuf {
  public count = 0
  public events = new Array<HEvent>()

  public clear(): void {
    this.count = 0
  }

  public add(hcount: number, type: HEventType, value: number, index = -1): void {
    const n = this.count
    // Search an event which has same type at the hcount.
    for (let i = n; --i >= 0; ) {
      const hevent = this.events[i]
      if (hevent.hcount !== hcount)
        break
      if (hevent.type === type && hevent.index === index) {
        // Move to the last
        for (let j = i; ++j < n; )
          this.events[j - 1] = this.events[j]
        this.events[n - 1] = hevent
        hevent.value = value
        return
      }
    }

    if (n >= this.events.length) {
      const hevent: HEvent = {
        type,
        value,
        index,
        hcount,
      }
      this.events.push(hevent)
    } else {
      const hevent = this.events[n]
      hevent.type = type
      hevent.value = value
      hevent.index = index
      hevent.hcount = hcount
    }
    ++this.count
  }
}

export class HEvents {
  private renderBuf = new HEventBuf()
  private nextBuf = new HEventBuf()

  public clear(): void {
    this.renderBuf.clear()
    this.nextBuf.clear()
  }

  public swap(): void {
    // Add sentinel: Ensure that current frame has an event at hline 240.
    this.nextBuf.add(Const.HEIGHT, HEventType.DUMMY, 0)

    const tmp = this.renderBuf
    this.renderBuf = this.nextBuf
    this.nextBuf = tmp
    this.nextBuf.clear()

    this.nextBuf.add(0, HEventType.DUMMY, 0)  // Ensure that next frame has an event at hline 0.
  }

  public getCount(): number {
    return this.renderBuf.count - 1  // Last one is sentinel, so -1
  }

  public getEvent(index: number): HEvent {
    return this.renderBuf.events[index]
  }

  public getLastHcount(): number {
    const n = this.nextBuf.count
    if (n <= 0)
      return -1
    return this.nextBuf.events[n - 1].hcount
  }

  public add(hcount: number, type: HEventType, value: number, index = -1): void {
    this.nextBuf.add(hcount, type, value, index)
  }
}

export class HStatus {
  public ppuCtrl = 0
  public ppuMask = 0
  public chrBankOffset = new Array<number>(8)
  public mirrorModeBit = 0x44  // 2bit x 4screen
  public scrollCurr = 0
  public scrollFineX = 0
  public palet = new Uint8Array(32)

  constructor() {
    this.reset()
  }

  public reset(): void {
    this.ppuCtrl = 0
    this.ppuMask = 0
    this.scrollCurr = 0
    this.scrollFineX = 0

    for (let i = 0; i < 8; ++i)
      this.chrBankOffset[i] = i << 10

    for (let i = 0; i < this.palet.length; ++i)
      this.palet[i] = kInitialPalette[i]
  }

  public copy(h: HStatus): void {
    this.ppuCtrl = h.ppuCtrl
    this.ppuMask = h.ppuMask
    this.mirrorModeBit = h.mirrorModeBit
    for (let i = 0; i < 8; ++i)
      this.chrBankOffset[i] = h.chrBankOffset[i]
    this.scrollCurr = h.scrollCurr
    this.scrollFineX = h.scrollFineX
    for (let i = 0; i < 32; ++i)
      this.palet[i] = h.palet[i]
  }

  public set(type: HEventType, value: number, index: number): boolean {
    switch (type) {
    case HEventType.DUMMY:
      break
    case HEventType.PPU_CTRL:
      if (this.ppuCtrl === value)
        return false
      this.ppuCtrl = value
      break
    case HEventType.PPU_MASK:
      if (this.ppuMask === value)
        return false
      this.ppuMask = value
      break
    case HEventType.CHR_BANK_OFFSET:
      if (this.chrBankOffset[index] === value)
        return false
      this.chrBankOffset[index] = value
      break
    case HEventType.MIRROR_MODE_BIT:
      if (this.mirrorModeBit === value)
        return false
      this.mirrorModeBit = value
      break
    case HEventType.SCROLL_CURR:
      if (this.scrollCurr === value)
        return false
      this.scrollCurr = value
      break
    case HEventType.SCROLL_FINE_X:
      if (this.scrollFineX === value)
        return false
      this.scrollFineX = value
      break
    case HEventType.PALET:
      if (this.palet[index] === value)
        return false
      this.palet[index] = value
      break
    default:
      console.error(`ERROR: type=${type}`)
      return false
    }
    return true
  }
}

/*
  Note

    * Status are triple buffered (in HEvents):
      1. current (modified according to CPU writes)
      2. lastFrame (keep begining state of last frame, to use at rendering)
      3. save ()

*/
export class HStatusMgr {
  public current = new HStatus()
  public lastFrame = new HStatus()
  public save = new HStatus()

  public reset(): void {
    this.current.reset()
    this.lastFrame.reset()
    this.save.reset()
  }

  public swap(): void {
    // Move save to lastFrame,
    // and keep current status into save as a next frame's start status.
    const tmp = this.lastFrame
    this.lastFrame = this.save
    this.save = tmp
    this.save.copy(this.current)
  }
}
