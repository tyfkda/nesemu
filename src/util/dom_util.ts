export default class DomUtil {
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

  public static handleFileDrop(dropZone: HTMLElement,
                               onDropped: (files: FileList, x: number, y: number) => void): void
  {
    function onDrop(event) {
      event.stopPropagation()
      event.preventDefault()
      const files = event.dataTransfer.files
      if (files.length > 0) {
        onDropped(files, event.pageX, event.pageY)
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
