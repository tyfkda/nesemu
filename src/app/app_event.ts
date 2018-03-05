import * as Pubsub from '../util/pubsub'

export namespace AppEvent {
  export enum Type {
    RENDER = 1,
    RUN,
    PAUSE,
    STEP,
    RESET,
    LOAD_ROM,
    BREAK_POINT,
    SCREEN_SHOT,
    DESTROY,
    START_CALC,
    END_CALC,
  }

  export class Stream extends Pubsub.Subject<Type> {
    public triggerRender() {
      this.next(Type.RENDER)
    }
    public triggerRun() {
      this.next(Type.RUN)
    }
    public triggerPause() {
      this.next(Type.PAUSE)
    }
    public triggerStep() {
      this.next(Type.STEP)
    }
    public triggerReset() {
      this.next(Type.RESET)
    }
    public triggerScreenShot() {
      this.next(Type.SCREEN_SHOT)
    }
    public triggerLoadRom() {
      this.next(Type.LOAD_ROM)
    }
    public triggerBreakPoint() {
      this.next(Type.BREAK_POINT)
    }
    public triggerDestroy() {
      this.next(Type.DESTROY)
    }

    public triggerStartCalc() {
      this.next(Type.START_CALC)
    }
    public triggerEndCalc() {
      this.next(Type.END_CALC)
    }
  }
}
