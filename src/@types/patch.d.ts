// Patches for type declarations.

interface Window {
  File: any
  FileList: any
  FileReader: any

  mozRequestAnimationFrame: any
  msRequestAnimationFrame: any

  AudioContext: any
  webkitAudioContext: any

  Gamepad: any

  app: App
  $DEBUG: boolean
}

interface HTMLElement {
  disabled: any
}

interface CSSStyleDeclaration {
  imageRendering: string
  resize: string
}
