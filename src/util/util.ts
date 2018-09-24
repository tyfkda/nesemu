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
    if (context == null)
      return
    context.strokeStyle = ''
    context.fillStyle = `rgb(64,64,64)`
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  public static removeAllChildren(element: HTMLElement): void {
    for (let child of element.childNodes)
      element.removeChild(child)
  }

  public static setStyles(elem: HTMLElement, styles: Object) {
    Object.assign(elem.style, styles)
  }

  public static loadFile(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = function(e) {
        const binary = new Uint8Array((e.target as any).result)
        resolve(binary)
      }
      reader.onerror = function(_e) {
        reject(reader.error)
      }
      reader.readAsArrayBuffer(file)
    })
  }

  public static getExt(fileName: string): string {
    const index = fileName.lastIndexOf('.')
    if (index >= 0)
      return fileName.slice(index + 1)
    return ''
  }

  public static handleFileDrop(dropZone: HTMLElement,
                               onDropped: (file: File, x: number, y: number) => void): void
  {
    function onDrop(event) {
      event.stopPropagation()
      event.preventDefault()
      const files = event.dataTransfer.files
      if (files.length > 0) {
        for (let i = 0; i < files.length; ++i) {
          const file = files[i]
          onDropped(file, event.pageX, event.pageY)
        }
      }
      return false
    }

    function onDragOver(event) {
      event.stopPropagation()
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      return false
    }

    dropZone.addEventListener('dragover', onDragOver, false)
    dropZone.addEventListener('drop', onDrop, false)
  }

  public static convertUint8ArrayToBase64String(src: Uint8Array): string {
    const s = Array.from(src).map(x => String.fromCharCode(x)).join('')
    // return new Buffer(s).toString('base64')  // node.js
    return btoa(s)
  }

  public static convertBase64StringToUint8Array(src: string): Uint8Array {
    // const decoded = new Buffer(s, 'base64').toString('ascii')  // node.js
    const decoded = atob(src)
    const array = new Array(decoded.length)
    for (let i = 0; i < decoded.length; ++i)
      array[i] = decoded.charCodeAt(i)
    return new Uint8Array(array)
  }

  public static getCanvasContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d')
    if (context == null)
      throw new Error('2d context not supported or canvas already initialized')
    return context
  }

  public static timeout(millisec): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, millisec))
  }

  public static download(blob: Blob, filename: string): void {
    const objectURL = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectURL
    a.setAttribute('download', filename)
    a.click()
  }

  public static chooseFile(callback: (files: any) => void) {
    const elem = document.createElement('input')
    elem.setAttribute('type', 'file')
    elem.setAttribute('accept', '.sav, application/json')
    elem.addEventListener('change', function(event) {
      callback((event.target as any).files)
    })
    elem.click()
  }
}
