export default class Util {
  public static hex(x: number, order: number = 2): string {
    const s = x.toString(16)
    const dif = s.length - order
    if (dif > 0)
      return s.substring(dif)
    if (dif === 0)
      return s
    const zeros = '0000000'
    return zeros.substring(zeros.length + dif) + s
  }

  public static clamp(x: number, min: number, max: number): number {
    return x < min ? min : x > max ? max : x
  }

  public static clearCanvas(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d')
    context.strokeStyle = ''
    context.fillStyle = `rgb(64,64,64)`
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  public static removeAllChildren(element: HTMLElement): void {
    for (let child of element.childNodes)
      element.removeChild(child)
  }
}
