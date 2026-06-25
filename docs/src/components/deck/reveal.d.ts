declare module 'reveal.js' {
  interface RevealOptions {
    embedded?: boolean
    hash?: boolean
    controls?: boolean
    progress?: boolean
    transition?: string
    backgroundTransition?: string
    plugins?: unknown[]
    [key: string]: unknown
  }

  interface RevealIndices {
    h: number
    v: number
    f: number | undefined
  }

  class Reveal {
    constructor(container: HTMLElement, options?: RevealOptions)
    on(event: string, listener: () => void): void
    getIndices(): RevealIndices
    initialize(): Promise<void>
    destroy(): void
  }

  export default Reveal
}

declare module 'reveal.js/plugin/notes/notes.esm.js' {
  const Notes: unknown
  export default Notes
}
