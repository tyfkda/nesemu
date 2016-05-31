// Patches for type declarations.

interface Window {
  Blob: any
  File: any
  FileList: any
  FileReader: any

  mozRequestAnimationFrame: any
  webkitRequestAnimationFrame: any

  nes: any
}

interface HTMLElement {
  disabled: any
}

interface CSSStyleDeclaration {
  imageRendering: string
  resize: string
}
