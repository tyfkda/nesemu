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
    OPEN_MENU,
    CLOSE_MENU,
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
    public triggerOpenMenu() {
      this.next(Type.OPEN_MENU)
    }
    public triggerCloseMenu() {
      this.next(Type.CLOSE_MENU)
    }
    public triggerCloseWnd(wnd: Wnd) {
      this.next(Type.CLOSE_WND, wnd)
    }
  }
}
