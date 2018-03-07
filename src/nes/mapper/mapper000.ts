import {Mapper, MapperOptions} from './mapper'

export class Mapper000 extends Mapper {
  public static create(_options: MapperOptions): Mapper {
    return new Mapper000()
  }

  // No special handling needed.
}
