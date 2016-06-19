import * as Rx from 'rxjs/Rx'

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
    MUTE,
    DESTROY,
  }

  export interface Event {
    type: Type
  }

  export class Stream extends Rx.Subject<any> {
    public triggerRender() {
      this.next({type: Type.RENDER})
    }
    public triggerRun() {
      this.next({type: Type.RUN})
    }
    public triggerPause() {
      this.next({type: Type.PAUSE})
    }
    public triggerStep() {
      this.next({type: Type.STEP})
    }
    public triggerReset() {
      this.next({type: Type.RESET})
    }
    public triggerScreenShot() {
      this.next({type: Type.SCREEN_SHOT})
    }
    public triggerMute(value: boolean) {
      this.next({type: Type.MUTE, value})
    }
    public triggerLoadRom() {
      this.next({type: Type.LOAD_ROM})
    }
    public triggerBreakPoint() {
      this.next({type: Type.BREAK_POINT})
    }
    public triggerDestroy() {
      this.next({type: Type.DESTROY})
    }
  }
}
