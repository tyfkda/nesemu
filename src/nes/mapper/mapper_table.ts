import {mapper000} from './mapper000.ts'
import {mapper001} from './mapper001.ts'
import {mapper002, mapper093} from './mapper002.ts'
import {mapper003, mapper185} from './mapper003.ts'
import {mapper004} from './mapper004.ts'
import {mapper007} from './mapper007.ts'
import {mapper010} from './mapper010.ts'
import {mapper019} from './mapper019.ts'
import {mapper023, mapper025} from './mapper023.ts'
import {mapper024} from './mapper024.ts'
import {mapper032} from './mapper032.ts'
import {mapper069} from './mapper069.ts'
import {mapper073} from './mapper073.ts'
import {mapper075} from './mapper075.ts'
import {mapper184} from './mapper184.ts'

export const kMapperTable: {[key: number]: Function} = {
  0: mapper000,
  1: mapper001,
  2: mapper002,
  3: mapper003,
  4: mapper004,
  7: mapper007,
  10: mapper010,
  19: mapper019,
  23: mapper023,
  24: mapper024,
  25: mapper025,
  32: mapper032,
  69: mapper069,
  73: mapper073,  // INES Mapper 073: Konami VRC3
  75: mapper075,
  88: mapper004,
  93: mapper093,  // INES Mapper 093: Sunsoft-2 IC
  95: mapper004,
  118: mapper004,
  184: mapper184,
  185: mapper185,
  206: mapper004,
}
