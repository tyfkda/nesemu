// Patches for type declarations.

interface Window {
  mozRequestAnimationFrame: any
  msRequestAnimationFrame: any

  webkitAudioContext: any

  showOpenFilePicker(option?: any): Promise<[FileSystemFileHandle]>
  showSaveFilePicker(option?: any): Promise<FileSystemFileHandle>

  app: any
  $DEBUG: boolean
}

interface FileSystemHandle {
  readonly kind: string
  readonly name: string
}

interface FileSystemFileHandle extends FileSystemHandle {
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
  name: string
}

interface WritableStream {
  close(): any
}

interface FileSystemWritableFileStream extends WritableStream {
  write(content: any): Promise<undefined>
}
