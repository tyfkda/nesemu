export interface Subscription {
  unsubscribe(): void
}

export interface Callback<Type> { (type: Type, param?: any): void }

function compactArray(array: any[]): void {
  let n = 0
  for (let i = 0; i < array.length; ++i) {
    if (array[i] != null)
      array[n++] = array[i]
  }
  array.length = n
}

export class Subject<Type> {
  private subscribers = new Array<Callback<Type>|null>()
  private anyRemoved = false
  private nestCount = 0

  public subscribe(callback: Callback<Type>): Subscription {
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

  public next(type: Type, param?: any): void {
    ++this.nestCount
    for (let s of this.subscribers)
      if (s != null)
        s(type, param)

    --this.nestCount
    if (this.nestCount === 0 && this.anyRemoved) {
      compactArray(this.subscribers)
      this.anyRemoved = false
    }
  }
}
