// Patches for type declarations.

interface Window {
  mozRequestAnimationFrame: any
  msRequestAnimationFrame: any

  webkitAudioContext: any

  app: any
  $DEBUG: boolean
}
