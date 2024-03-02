import fs from 'node:fs/promises'
import * as fsNonPromise from 'fs'
import path from 'path'
import tty from 'tty'
import {unzip, AsyncUnzipOptions, Unzipped} from 'fflate'
import wav from 'node-wav'
import util from 'util'

import {Cartridge} from '../src/nes/cartridge'
import {DeltaModulationSampler, kDmcRateTable} from '../src/util/audio/delta_modulation_sampler'
import {Reg} from '../src/nes/apu'

function readAll(fd: number): string {
  return fsNonPromise.readFileSync(fd, 'utf-8')
}

// Labeled-Comma separated Value: adr:13,len:48,rate:15,bank2:14
function parseLcsv(lcsv: string, types?: Record<string, string>): Array<object> {
  // TODO: Use CSV parser.
  return lcsv.split('\n')
      .filter(row => row.trim().length > 0)
      .map(row => {
        const cols = row.split(',')
            .map((col, lineNo) => {
              const i = col.indexOf(':')
              if (i <= 0) {
                console.error(`Illegal CSV format at line ${lineNo + 1}`)
                process.exit(1)
              }
              const key = col.slice(0, i)
              let value: string|number = col.slice(i + 1)
              if (types != null && key in types) {
                switch (types[key]) {
                case 'int':
                  value = parseInt(value)
                  break
                default:
                  console.error(`Unknown type: [${key}]=${types[key]}`)
                  break
                }
              }
              return [key, value]
            })
        return Object.fromEntries(cols)
      })
}

type DmcParam = {
  rate: number;
  adr: number;
  len: number;
  bank: number;
  value?: number;
}

function sampleDmc(romData: Uint8Array, params: DmcParam, sampleRate: number): Float32Array {
  if (!Cartridge.isRomValid(romData)) {
    console.error('Invalid format')
    process.exit(1)
  }

  const cartridge = new Cartridge(romData)
  const sampler = new DeltaModulationSampler(sampleRate)
  sampler.setPrgRom(cartridge.prgRom)
  sampler.changePrgBank(params.adr < 128 ? 2 : 3, params.bank)

  sampler.setVolume(1)
  sampler.setDmcWrite(0xff, 0)  // Off
  sampler.setDmcWrite(Reg.STATUS, params.rate)
  if (params.value != null)
    sampler.setDmcWrite(Reg.DIRECT_LOAD, params.value)
  sampler.setDmcWrite(Reg.SAMPLE_ADDRESS, params.adr)
  sampler.setDmcWrite(Reg.SAMPLE_LENGTH, params.len)
  sampler.setDmcWrite(0xff, 1)  // On

  const APU_DMC_HZ = 894887 * 2
  const length = Math.ceil(((params.len << 4) + 1) * 8 * kDmcRateTable[params.rate] * sampleRate / APU_DMC_HZ) | 0
  const f32array = new Float32Array(length)
  sampler.fillBuffer(f32array)

  return f32array
}

async function dmc2wav(romData: Uint8Array, opts: Array<DmcParam>, sampleRate: number, dstFileName: string): Promise<void> {
  const orgDstFileName = dstFileName
  let count = 0

  for (const opt of opts) {
    if (count > 0)
      dstFileName = `${path.parse(orgDstFileName).name}.${count}.wav`

    const f32array = sampleDmc(romData, opt, sampleRate)
    const encoded = wav.encode([f32array], {sampleRate})
    await fs.writeFile(dstFileName, new Uint8Array(encoded))
    ++count
  }
}

async function loadNesRomData(romFileName: string): Promise<Uint8Array> {
  switch (path.extname(romFileName).toLowerCase()) {
  case '.nes':
    const buffer = await fs.readFile(romFileName) as Buffer
    return new Uint8Array(buffer)
  case '.zip':
    {
      const buffer = await fs.readFile(romFileName)
      const options = {
        filter(file: any) {
          return path.extname(file.name).toLowerCase() === '.nes'
        }
      }
      const loadedZip = await util.promisify<Uint8Array, AsyncUnzipOptions, Unzipped>(unzip)(buffer, options)
      for (let fileName of Object.keys(loadedZip)) {
        const unzipped = loadedZip[fileName]
        return unzipped
      }
    }
    console.error(`${romFileName}: .nes not included`)
    break
  default:
    console.error(`${romFileName}: Unsupported extname`)
    break
  }
  return Promise.reject()
}

function usage() {
  console.error(`Please specify .nes or .zip file(s), and dmc-parameters in LCSV format:
    ex. "rate:15,adr:AAAAAAAA,len:LLLLLLLL,bank:BBBBB}"`)
  process.exit(1)
}

async function main(): Promise<void> {
  const argv = process.argv
  if (argv.length <= 2) {
    usage()
  }

  const romFileName = argv[2]
  const romData = await loadNesRomData(romFileName)

  const sampleRate = 48000

  const kTypes = {
    adr: 'int',
    len: 'int',
    rate: 'int',
    bank: 'int',
  }

  let params: Array<DmcParam>
  if (argv.length > 3) {
    params = argv.slice(3).map(v => parseLcsv(v, kTypes)[0] as DmcParam)
  } else {
    if (tty.isatty(0))
      usage()

    const csv = readAll(process.stdin.fd)
    params = parseLcsv(csv, kTypes) as Array<DmcParam>
  }
  const dstFileName = `${path.parse(romFileName).name}.wav`
  dmc2wav(romData, params, sampleRate, dstFileName)
}

main()
