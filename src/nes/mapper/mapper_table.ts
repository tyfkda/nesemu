import {mapper000} from './mapper000.ts'
import {mapper001} from './mapper001.ts'
import {mapper002, mapper093} from './mapper002.ts'
import {mapper003} from './mapper003.ts'
import {mapper004} from './mapper004.ts'

export const kMapperTable: {[key: number]: Function} = {
  0: mapper000,
  1: mapper001,
  2: mapper002,
  3: mapper003,
  4: mapper004,

  93: mapper093,  // INES Mapper 093: Sunsoft-2 IC
}
