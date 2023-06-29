import {Mapper, MapperOptions} from './mapper'

export class Mapper000 extends Mapper {
  public static create(options: MapperOptions): Mapper {
    return new Mapper000(options)
  }

  // No special handling needed.
}
