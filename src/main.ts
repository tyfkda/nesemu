import {NesEmu} from './nesemu.ts'

import {Cpu6502} from './cpu.ts'
import {RomData} from './,romdata.ts'
import {Util} from './util.ts'

function loadPrgRom(romData: number[]): Uint8Array {
  const prg = romData.slice(16, 16 + 16 * 1024)
  return new Uint8Array(prg)
}

function showCpuStatus(cpu: Cpu6502): void {
  const e = id => <HTMLInputElement>document.getElementById(id)
  e('reg-pc').value = Util.hex(cpu.pc, 4)
  e('reg-a').value = Util.hex(cpu.a, 2)
  e('reg-x').value = Util.hex(cpu.x, 2)
  e('reg-y').value = Util.hex(cpu.y, 2)
  e('reg-s').value = Util.hex(cpu.s, 2)
  e('reg-p').value = Util.hex(cpu.p, 2)
}

function putConsole(line) {
  const cons = <HTMLTextAreaElement>document.getElementById('console')
  cons.value += `${line}\n`
  cons.scrollTop = cons.scrollHeight
}

function clearConsole() {
  const cons = <HTMLTextAreaElement>document.getElementById('console')
  cons.value = ''
}

function dumpCpu(cpu: Cpu6502) {
  const h2 = (x) => Util.hex(x, 2)
  const h4 = (x) => Util.hex(x, 4)
  const op = cpu.read8(cpu.pc)
  const line = `${h4(cpu.pc)}: ${h2(op)}  a=${h2(cpu.a)} x=${h2(cpu.x)} y=${h2(cpu.y)}, s=${h2(cpu.s)}`
  putConsole(line)
  showCpuStatus(cpu)
}

function cpuTest() {
  const prgRom = loadPrgRom(RomData)
  const cpu = new Cpu6502()
  cpu.setRam(0)
  cpu.setRam(1)
  cpu.setRom(2, prgRom)
  cpu.setRom(3, prgRom)
  cpu.reset()
  dumpCpu(cpu)

  document.getElementById('step').addEventListener('click', () => {
    cpu.step()
    dumpCpu(cpu)
  })
  document.getElementById('run').addEventListener('click', () => {
    for (let i = 0; i < 100; ++i) {
      cpu.step()
      dumpCpu(cpu)
    }
  })
  document.getElementById('reset').addEventListener('click', () => {
    cpu.reset()
    clearConsole()
    dumpCpu(cpu)
  })
}

window.addEventListener('load', () => {
  NesEmu.main('nesroot')

  cpuTest()
})
