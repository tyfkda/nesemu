export class DomUtil {
  public static clearCanvas(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d')
    if (context == null)
      return
    context.strokeStyle = ''
    context.fillStyle = `rgb(64,64,64)`
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  public static removeAllChildren(element: HTMLElement): void {
    for (const child of element.childNodes)
      element.removeChild(child)
  }

  public static setStyles(elem: HTMLElement, styles: Record<string, unknown>): void {
    Object.assign(elem.style, styles)
  }

  public static loadFile(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = function(e) {
        const target = e.target as FileReader
        if (target.result)
          resolve(new Uint8Array(target.result as ArrayBuffer))
        else
          reject()
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
    function onDrop(event: DragEvent): boolean {
      if (event.dataTransfer) {
        event.stopPropagation()
        event.preventDefault()
        const files = event.dataTransfer.files
        if (files.length > 0) {
          onDropped(files, event.pageX, event.pageY)
        }
      }
      return false
    }

    function onDragOver(event: DragEvent): boolean {
      if (event.dataTransfer) {
        event.stopPropagation()
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }
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

  public static async downloadOrSaveToFile(data: any, filename: string, description: string, mimeType: string, extension: string): Promise<FileSystemFileHandle|null> {
    if (window.showSaveFilePicker != null) {
      const accept: Record<string, any> = {}
      accept[mimeType] = [extension]
      const kFilePickerOption = {
        suggestedName: filename,
        types: [{
          description,
          accept,
        }],
      }
      const fileHandle = await window.showSaveFilePicker(kFilePickerOption)
      const writable = await fileHandle.createWritable()
      await writable.write(data)
      await writable.close()
      return fileHandle
    } else {
      const blob = new Blob([data], {type: mimeType})
      const objectURL = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectURL
      a.setAttribute('download', filename)
      a.click()
      return null
    }
  }

  public static async pickOpenFile(extension: string, description: string, mimeType: string): Promise<{file: File; fileHandle?: FileSystemFileHandle} | null> {
    if (window.showOpenFilePicker != null || false) {
      const accept: Record<string, string> = {}
      accept[mimeType] = extension
      const option = {
        types: [{
          description,
          accept,
        }],
      }
      const [fileHandle] = await window.showOpenFilePicker(option)
      const file = await fileHandle.getFile()
      return {file, fileHandle}
    } else {
      return new Promise((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = `${extension}, ${mimeType}`
        input.onchange = async (_event) => {
          if (!input.value)
            return
          const fileList = input.files
          if (fileList) {
            const file = fileList[0]
            resolve({file})
          } else {
            reject(null)
          }
          input.value = ''
        }
        input.click()
      })
    }
  }
}
