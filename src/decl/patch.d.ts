// Patches for type declarations.

interface Window {
  File: any
  FileList: any
  FileReader: any

  mozRequestAnimationFrame: any
  // webkitRequestAnimationFrame: any
  msRequestAnimationFrame: any

  AudioContext: any
  webkitAudioContext: any

  Gamepad: any

  nes: any
  jsNes: any
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
