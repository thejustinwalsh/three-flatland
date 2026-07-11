// three ships no .d.ts for the Inspector addon (three/addons/inspector/Inspector.js).
// Minimal ambient shim covering what this example uses.
declare module 'three/addons/inspector/Inspector.js' {
  export class Inspector {
    domElement: HTMLElement
    constructor()
    setRenderer(renderer: unknown): void
  }
}
