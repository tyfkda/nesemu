import * as fs from 'fs';
import * as path from 'path'
import {promisify} from 'util'
import * as JSZip from 'jszip'

function getMapperNo(romData: Uint8Array): number {
  const NES = 'NES'
  if (romData[0] !== NES.charCodeAt(0) || romData[1] !== NES.charCodeAt(1) ||
      romData[2] !== NES.charCodeAt(2) || romData[3] !== 0x1a) {
    console.error('Invalid format')
    process.exit(1)
  }
  return ((romData[6] >> 4) & 0x0f) | (romData[7] & 0xf0)
}

function dumpMapper(fn: string): void {
  switch (path.extname(fn).toLowerCase()) {
  case '.nes':
    promisify(fs.readFile)(fn)
      .then((buffer: Buffer) => {
        console.log(`"${path.basename(fn)}"\tmapper=${getMapperNo(buffer)}`)
      })
    break
  case '.zip':
    promisify(fs.readFile)(fn)
      .then((buffer: Buffer) => {
        const zip = new JSZip()
        return zip.loadAsync(buffer)
      })
      .then((loadedZip: JSZip) => {
        for (let fileName of Object.keys(loadedZip.files)) {
          if (path.extname(fileName).toLowerCase() === '.nes') {
            return loadedZip.files[fileName].async('uint8array')
          }
        }
        return Promise.reject(`${fn}: .nes not included`)
      })
      .then((unzipped: Uint8Array) => {
        console.log(`"${path.basename(fn)}"\tmapper=${getMapperNo(unzipped)}`)
      })
    break
  default:
    console.error(`${fn}: Unsupported extname`)
    process.exit(1)
    break;
  }
}

function main(): void {
  const argv = process.argv
  if (argv.length < 3) {
    console.error('Please specify .nes or .zip file(s).')
    process.exit(1)
  }

  for (let i = 2; i < argv.length; ++i) {
    dumpMapper(argv[i])
  }
}

main()
