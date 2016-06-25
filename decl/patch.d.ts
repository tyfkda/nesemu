// Patches for type declarations.

interface Window {
  Blob: any
  File: any
  FileList: any
  FileReader: any

  mozRequestAnimationFrame: any
  webkitRequestAnimationFrame: any

  AudioContext: any
  webkitAudioContext: any

  Gamepad: any

  Rx: any

  nes: any
  $DEBUG: boolean
}

interface Document {
  fullScreen: Function
  mozFullScreen: Function
}

interface HTMLElement {
  disabled: any
}

interface CSSStyleDeclaration {
  imageRendering: string
  resize: string
}

interface AudioContext {
  close(): void
}
