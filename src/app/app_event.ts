import * as Pubsub from '../util/pubsub'
import {Wnd} from '../wnd/wnd'

export namespace AppEvent {
  export const enum Type {
    UPDATE = 1,
    RENDER,
    RUN,
    PAUSE,
    STEP,
    RESET,
    BREAK_POINT,
    START_CALC,
    END_CALC,
    PAUSE_APP,
    RESUME_APP,
    CLOSE_WND,
  }

  export class Stream extends Pubsub.Subject<Type> {
    public triggerUpdate(elapsed: number): void {
      this.next(Type.UPDATE, elapsed)
    }
    public triggerRender(): void {
      this.next(Type.RENDER)
    }
    public triggerRun(): void {
      this.next(Type.RUN)
    }
    public triggerPause(): void {
      this.next(Type.PAUSE)
    }
    public triggerStep(): void {
      this.next(Type.STEP)
    }
    public triggerReset(): void {
      this.next(Type.RESET)
    }
    public triggerBreakPoint(): void {
      this.next(Type.BREAK_POINT)
    }

    public triggerStartCalc(): void {
      this.next(Type.START_CALC)
    }
    public triggerEndCalc(): void {
      this.next(Type.END_CALC)
    }
    public triggerPauseApp(): void {
      this.next(Type.PAUSE_APP)
    }
    public triggerResumeApp(): void {
      this.next(Type.RESUME_APP)
    }
    public triggerCloseWnd(wnd: Wnd): void {
      this.next(Type.CLOSE_WND, wnd)
    }
  }
}
