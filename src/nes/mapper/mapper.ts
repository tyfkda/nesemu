export interface PrgBankController {
  setPrgBank(bank: number, page: number): void
}

export class Mapper {
  public reset() {
  }

  public onHblank(hcount: number): void {
  }

  public save(): object {
    return null
  }

  public load(_saveData: any): void {
  }
}
