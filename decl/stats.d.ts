declare class Stats {
  public REVISION: number;
  public domElement: HTMLElement;

  constructor();

  public setMode(value: number): void;
  public begin(): void;
  public end(): void;
  public update(): void;
}
