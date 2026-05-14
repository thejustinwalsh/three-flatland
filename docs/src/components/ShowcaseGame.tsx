import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import type { PlaySoundFn } from '../audio/types'
import { useGPUSupport } from '../utils/useGPUSupport'

const MiniBreakout = lazy(() => import('@three-flatland/mini-breakout'))

function ShowcaseGameInner() {
  const [zzfxProxy, setProxy] = useState<PlaySoundFn | null>(null)
  const [isVisible, setVisible] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  // Audio module is dynamically imported so the bridge + zzfx + zzfxm
  // code-splits out of the main bundle. The static `PlaySoundFn` type
  // import above is type-only and erases at compile time. The proxy
  // factory is fetched lazily on mount; the noop fallback covers the
  // brief window before the import resolves.
  useEffect(() => {
    let cancelled = false
    import('../scripts/sounds')
      .then((sounds) => {
        if (cancelled) return
        setProxy(() => sounds.createZzfxProxy())
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setVisible(entry.isIntersecting)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [])

  const noopZzfx: PlaySoundFn = () => {}

  const handleInteraction = useCallback(() => {
    import('../scripts/sounds')
      .then((sounds) => sounds.initAudio())
      .catch(() => {})
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        aspectRatio: '3 / 2',
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <Suspense fallback={null}>
        <MiniBreakout
          zzfx={zzfxProxy ?? noopZzfx}
          isVisible={isVisible}
          onInteraction={handleInteraction}
          showStats
        />
      </Suspense>
    </div>
  )
}

export default function ShowcaseGame() {
  const gpu = useGPUSupport()
  if (gpu === null) return null
  if (gpu === false) {
    return (
      <div
        role="note"
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--muted-foreground, currentColor)',
          fontSize: '0.875rem',
          lineHeight: 1.5,
        }}
      >
        Showcase requires a browser with WebGPU or WebGL2 support.
      </div>
    )
  }
  return <ShowcaseGameInner />
}
