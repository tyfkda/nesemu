// Patches for type declarations.

interface Window {
  mozRequestAnimationFrame: any
  msRequestAnimationFrame: any

  webkitAudioContext: any

  app: App
  $DEBUG: boolean
}
