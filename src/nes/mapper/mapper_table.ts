import {Mapper, MapperOptions} from './mapper'
import {Mapper000} from './mapper000'
import {Mapper001} from './mapper001'
import {Mapper002, Mapper093} from './mapper002'
import {Mapper003, Mapper185} from './mapper003'
import {Mapper004, Mapper088, Mapper095, Mapper118} from './mapper004'
import {Mapper005} from './mapper005'
import {Mapper007} from './mapper007'
import {Mapper010} from './mapper010'
import {Mapper016} from './mapper016'
import {Mapper019} from './mapper019'
import {Mapper023, Mapper025} from './mapper023'
import {Mapper024, Mapper026} from './mapper024'
import {Mapper032} from './mapper032'
import {Mapper066} from './mapper066'
import {Mapper069} from './mapper069'
import {Mapper073} from './mapper073'
import {Mapper087} from './mapper087'
import {Mapper075} from './mapper075'
import {Mapper184} from './mapper184'

export const kMapperTable: {[key: number]: (options: MapperOptions) => Mapper} =
{  // Mapper
  0: Mapper000.create,
  1: Mapper001.create,
  2: Mapper002.create,
  3: Mapper003.create,
  4: Mapper004.create,
  5: Mapper005.create,
  7: Mapper007.create,
  10: Mapper010.create,
  16: Mapper016.create,
  19: Mapper019.create,
  23: Mapper023.create,
  24: Mapper024.create,
  25: Mapper025.create,
  26: Mapper026.create,
  32: Mapper032.create,
  66: Mapper066.create,
  69: Mapper069.create,
  73: Mapper073.create,  // INES Mapper 073: Konami VRC3
  75: Mapper075.create,
  87: Mapper087.create,
  88: Mapper088.create,
  93: Mapper093.create,  // INES Mapper 093: Sunsoft-2 IC
  95: Mapper095.create,
  118: Mapper118.create,
  184: Mapper184.create,
  185: Mapper185.create,
  206: Mapper004.create,
}
