import { useEffect, useRef, type ReactNode } from 'react'
import { DeckCanvas } from './DeckCanvas'
import { setPosition } from './presentationStore'

export function Presentation({ slides, scene }: { slides: ReactNode; scene: ReactNode }) {
  const deckRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let deck: { destroy: () => void } | undefined
    let cancelled = false

    ;(async () => {
      const [{ default: Reveal }, { default: Notes }] = await Promise.all([
        import('reveal.js'),
        import('reveal.js/plugin/notes/notes.esm.js'),
      ])
      if (cancelled || !deckRef.current) return

      const instance = new Reveal(deckRef.current, {
        embedded: false,
        hash: false,
        controls: true,
        progress: false,
        transition: 'none',
        backgroundTransition: 'none',
        plugins: [Notes],
      })

      const sync = () => {
        const { h, f } = instance.getIndices()
        setPosition({ slideIndex: h ?? 0, fragment: f ?? -1 })
      }
      instance.on('ready', sync)
      instance.on('slidechanged', sync)
      instance.on('fragmentshown', sync)
      instance.on('fragmenthidden', sync)

      await instance.initialize()
      deck = instance
      sync()
    })()

    return () => {
      cancelled = true
      deck?.destroy()
    }
  }, [])

  return (
    <>
      <div className="deck-bg">
        <DeckCanvas>{scene}</DeckCanvas>
      </div>
      <div className="reveal-root">
        <div className="reveal" ref={deckRef}>
          <div className="slides">{slides}</div>
        </div>
      </div>
    </>
  )
}
