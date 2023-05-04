import fs from 'node:fs/promises'
import crypto from 'crypto'
import path from 'path'

import JSZip from 'jszip'
import {Nes, NesEvent} from '../src/nes/nes'
import {Cartridge} from '../src/nes/cartridge'
import {Util} from '../src/util/util'

const WIDTH = 256
const HEIGHT = 240

function createMyApp() {
  class MyApp {
    private nes: Nes
    private pad = 0
    private pixels = new Uint8Array(WIDTH * HEIGHT * 4)

    constructor() {
      this.nes = new Nes()
    }

    public loadRom(romData: Uint8Array): void {
      if (!Cartridge.isRomValid(romData))
        throw 'Invalid format'

      const cartridge = new Cartridge(romData)
      if (!Nes.isMapperSupported(cartridge.mapperNo))
        throw `Mapper ${cartridge.mapperNo} not supported`

      this.nes.setCartridge(cartridge)
      this.nes.reset()

      this.nes.setEventCallback((event: NesEvent, param?: any) => {
        switch (event) {
        case NesEvent.VBlank:
          this.onVblank(param as number)
          break
        default: break
        }
      })
    }

    public reset(): void {
      this.nes.reset()
    }

    public run(elapsedTime: number): void {
      this.nes.setPadStatus(0, this.pad)
      this.nes.runMilliseconds(elapsedTime)
    }

    public getPixels(): Uint8Array { return this.pixels }

    private onVblank(leftV: number): void {
      if (leftV < 1)
        this.render()
    }

    private render(): void {
      this.nes.render(this.pixels)
    }
  }

  return new MyApp()
}

function calcSha1(pixels: Uint8Array) {
  const shasum = crypto.createHash('sha1')
  shasum.update(pixels)
  return shasum.digest('base64')
}

async function savePpm(fileName: string, pixels: Uint8Array) {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3)
  for (let i = 0; i < WIDTH * HEIGHT; ++i) {
    const src = i * 4
    const dst = i * 3
      rgb[dst + 0] = pixels[src + 0]
    rgb[dst + 1] = pixels[src + 1]
    rgb[dst + 2] = pixels[src + 2]
  }

  const fd = await fs.open(fileName, 'w')
  await fd.write(`P6\n${WIDTH} ${HEIGHT}\n255\n`)
  await fd.write(rgb)
  await fd.close()
}

async function main() {
  const program = require('commander')

  function myParseInt(value: string, _dummyPrevious: string) {
    // parseInt takes a string and a radix
    const parsedValue = parseInt(value, 10)
    if (isNaN(parsedValue)) {
      throw new program.InvalidArgumentError('Not a number.')
    }
    return parsedValue
  }

  program
    .option('--runframes <frame>', 'Frame count', myParseInt)
    .option('--filename <filename>', 'File name')
    .option('--filepath <filepath>', 'File path')
    .option('--tvsha1 <sha1>', 'SHA1')
    .option('--input-log <inputs...>', 'Inputs')
    .parse(process.argv)
  const opts = program.opts()
  // const args = program.args

  if (opts.filepath == null) {
    program.help()
    process.exit(1)
  }

  const fileName = opts.filepath
  let romData = await fs.readFile(fileName) as Uint8Array
  if (Util.getExt(fileName).toLowerCase() === 'zip') {
    const zip = new JSZip()
    const loadedZip = await zip.loadAsync(romData as Buffer)
    let found = false
    for (let fn of Object.keys(loadedZip.files)) {
      if (Util.getExt(fn).toLowerCase() === 'nes') {
        romData = await loadedZip.files[fn].async('uint8array')
        found = true
        break
      }
    }
    if (!found) {
      console.error(`.nes not included in ${fileName}`)
      process.exit(1)
    }
  }

  const myApp = createMyApp()
  myApp.loadRom(romData)

  const sha1s = new Array<string>()
  const dt = 1000.0 / 60
  for (let i = 0; i < opts.runframes; ++i) {
    myApp.run(Math.round(dt))
    const pixels = myApp.getPixels()
    const sha1 = calcSha1(pixels)
    sha1s.push(sha1)
  }

  const pixels = myApp.getPixels()
  await savePpm(`,tmp/${path.basename(opts.filename)}.ppm`, pixels)

  if (sha1s.indexOf(opts.tvsha1) >= 0) {
    console.log(`ok: ${opts.filename}`)
  } else {
    console.log(`NG: ${opts.filename}`)
    process.exit(1)
  }
}

main()
