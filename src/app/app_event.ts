import * as Pubsub from '../util/pubsub'
import {Wnd} from '../wnd/wnd'

export namespace AppEvent {
  export const enum Type {
    RENDER = 1,
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
    public triggerBreakPoint() {
      this.next(Type.BREAK_POINT)
    }

    public triggerStartCalc() {
      this.next(Type.START_CALC)
    }
    public triggerEndCalc() {
      this.next(Type.END_CALC)
    }
    public triggerPauseApp() {
      this.next(Type.PAUSE_APP)
    }
    public triggerResumeApp() {
      this.next(Type.RESUME_APP)
    }
    public triggerCloseWnd(wnd: Wnd) {
      this.next(Type.CLOSE_WND, wnd)
    }
  }
}
