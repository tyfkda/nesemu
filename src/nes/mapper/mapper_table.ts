import {Mapper} from './mapper'
import {Mapper000} from './mapper000'
import {Mapper001} from './mapper001'
import {Mapper002, Mapper093} from './mapper002'
import {Mapper003, Mapper185} from './mapper003'
import {Mapper004} from './mapper004'
import {Mapper007} from './mapper007'
import {Mapper010} from './mapper010'
import {Mapper019} from './mapper019'
import {Mapper023, Mapper025} from './mapper023'
import {Mapper024} from './mapper024'
import {Mapper032} from './mapper032'
import {Mapper069} from './mapper069'
import {Mapper073} from './mapper073'
import {Mapper075} from './mapper075'
import {Mapper184} from './mapper184'

export const kMapperTable: {[key: number]: Mapper} = {
  0: Mapper000,
  1: Mapper001,
  2: Mapper002,
  3: Mapper003,
  4: Mapper004,
  7: Mapper007,
  10: Mapper010,
  19: Mapper019,
  23: Mapper023,
  24: Mapper024,
  25: Mapper025,
  32: Mapper032,
  69: Mapper069,
  73: Mapper073,  // INES Mapper 073: Konami VRC3
  75: Mapper075,
  88: Mapper004,
  93: Mapper093,  // INES Mapper 093: Sunsoft-2 IC
  95: Mapper004,
  118: Mapper004,
  184: Mapper184,
  185: Mapper185,
  206: Mapper004,
}
