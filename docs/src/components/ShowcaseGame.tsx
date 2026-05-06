import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { initAudio } from '../scripts/sounds'
import type { PlaySoundFn } from '../scripts/sounds'
import { useGPUSupport } from '../utils/useGPUSupport'

const MiniBreakout = lazy(() => import('@three-flatland/mini-breakout'))

function ShowcaseGameInner() {
  const [zzfxProxy, setProxy] = useState<PlaySoundFn | null>(null)
  const [isVisible, setVisible] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    import('../scripts/sounds').then((sounds) => {
      setProxy(() => sounds.createZzfxProxy())
    }).catch(() => {})
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
    initAudio().catch(() => {})
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
