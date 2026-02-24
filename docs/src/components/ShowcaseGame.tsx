import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { initAudio } from '../scripts/sounds'
import type { PlaySoundFn } from '../scripts/sounds'

const MiniBreakout = lazy(() => import('@three-flatland/mini-breakout'))

declare global {
  interface Window {
    __gpuSupported?: boolean
  }
}

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
  if (typeof window !== 'undefined' && window.__gpuSupported === false) return null
  return <ShowcaseGameInner />
}
