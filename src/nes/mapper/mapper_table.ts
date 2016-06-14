import {mapper000} from './mapper000.ts'
import {mapper001} from './mapper001.ts'
import {mapper002, mapper093} from './mapper002.ts'
import {mapper003} from './mapper003.ts'
import {mapper004} from './mapper004.ts'
import {mapper007} from './mapper007.ts'
import {mapper073} from './mapper073.ts'
import {mapper184} from './mapper184.ts'

export const kMapperTable: {[key: number]: Function} = {
  0: mapper000,
  1: mapper001,
  2: mapper002,
  3: mapper003,
  4: mapper004,

  7: mapper007,

  73: mapper073,  // INES Mapper 073: Konami VRC3
  93: mapper093,  // INES Mapper 093: Sunsoft-2 IC
  184: mapper184,
}
