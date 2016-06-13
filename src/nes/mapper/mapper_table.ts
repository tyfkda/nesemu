import {mapper00} from './mapper00.ts'
import {mapper01} from './mapper01.ts'
import {mapper02, mapper5d} from './mapper02.ts'
import {mapper03} from './mapper03.ts'
import {mapper04} from './mapper04.ts'

export const kMapperTable: {[key: number]: Function} = {
  0x00: mapper00,
  0x01: mapper01,
  0x02: mapper02,
  0x03: mapper03,
  0x04: mapper04,

  0x5d: mapper5d,  // INES Mapper 093: Sunsoft-2 IC
}
