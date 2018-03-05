export interface Subscription {
  unsubscribe()
}

export interface Callback<Type> { (param: Type): void }

function compactArray(array: any[]): void {
  let n = 0
  for (let i = 0; i < array.length; ++i) {
    if (array[i] != null)
      array[n++] = array[i]
  }
  array.length = n
}

export class Subject<Type> {
  private subscribers = new Array<Callback<Type>>()
  private anyRemoved = false

  public subscribe(callback: Callback<Type>): Subscription {
    if (callback == null)
      return null

    this.subscribers.push(callback)
    return {
      unsubscribe: () => {
        const i = this.subscribers.indexOf(callback)
        if (i !== -1) {
          this.subscribers[i] = null
          this.anyRemoved = true
        }
      },
    }
  }

  public next(arg: Type): void {
    for (let s of this.subscribers)
      if (s != null)
        s(arg)

    if (this.anyRemoved) {
      compactArray(this.subscribers)
      this.anyRemoved = false
    }
  }
}
