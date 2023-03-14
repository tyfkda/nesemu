import * as fs from 'fs';
import * as path from 'path'
import {promisify} from 'util'
import JSZip from 'jszip'

function getMapperNo(romData: Uint8Array): number {
  const NES = 'NES'
  if (romData[0] !== NES.charCodeAt(0) || romData[1] !== NES.charCodeAt(1) ||
      romData[2] !== NES.charCodeAt(2) || romData[3] !== 0x1a) {
    console.error('Invalid format')
    process.exit(1)
  }
  return ((romData[6] >> 4) & 0x0f) | (romData[7] & 0xf0)
}

async function dumpMapper(fn: string): Promise<void> {
  switch (path.extname(fn).toLowerCase()) {
  case '.nes':
    const buffer = await promisify(fs.readFile)(fn) as Buffer
    console.log(`"${path.basename(fn)}"\tmapper=${getMapperNo(buffer)}`)
    return
  case '.zip':
    {
      const buffer = await promisify(fs.readFile)(fn)
      const zip = new JSZip()
      const loadedZip = await zip.loadAsync(buffer)
      for (let fileName of Object.keys(loadedZip.files)) {
        if (path.extname(fileName).toLowerCase() === '.nes') {
          const unzipped = await loadedZip.files[fileName].async('uint8array')
          console.log(`"${path.basename(fn)}"\tmapper=${getMapperNo(unzipped)}`)
          return
        }
      }
    }
    console.error(`${fn}: .nes not included`)
    break
  default:
    console.error(`${fn}: Unsupported extname`)
    break
  }
  process.exit(1)
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
