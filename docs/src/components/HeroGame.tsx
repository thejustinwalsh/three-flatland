import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { initAudio } from '../scripts/sounds'
import type { PlaySoundFn } from '../scripts/sounds'

// Lazy load the mini-game
const MiniBreakout = lazy(() => import('@three-flatland/mini-breakout'))

declare global {
  interface Window {
    __gpuSupported?: boolean
  }
}

// Corner size as % of container
const C = '15%'
const BORDER = '1.5px solid currentColor'

/** Photo-frame corner brackets + spinner */
function LoadingOverlay({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        color: 'var(--sl-color-gray-4, rgba(255,255,255,0.5))',
        opacity: visible ? 0.6 : 0,
        transition: 'opacity 0.3s ease-in',
        zIndex: 1,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, width: C, height: C, borderTop: BORDER, borderLeft: BORDER }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: C, height: C, borderTop: BORDER, borderRight: BORDER }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: C, height: C, borderBottom: BORDER, borderLeft: BORDER }} />
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: C, height: C, borderBottom: BORDER, borderRight: BORDER }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`
          @keyframes grid-pulse {
            0%, 11.1% { opacity: 1; }
            11.2%, 100% { opacity: 0.12; }
          }
        `}</style>
        <svg width="40" height="40" viewBox="0 0 22 22" fill="currentColor" style={{ imageRendering: 'pixelated' }}>
          {/* 3x3 grid, 4px squares, 2px gap — spiral from center */}
          {[0,1,2,3,4,5,6,7,8].map(i => {
            const x = (i % 3) * 6
            const y = Math.floor(i / 3) * 6
            // Spiral order from center: 4→5→8→7→6→3→0→1→2
            const order = [6,7,8,5,0,1,4,3,2]
            const delay = -(order[i] * 2 / 9)
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width="4"
                height="4"
                style={{
                  opacity: 0.12,
                  animation: `grid-pulse 2s ${delay}s infinite`,
                  willChange: 'opacity',
                }}
              />
            )
          })}
        </svg>
      </div>
    </div>
  )
}

/** Fires onMount when rendered (i.e. when Suspense resolves) */
function NotifyMounted({ onMount, children }: { onMount: () => void; children: React.ReactNode }) {
  useEffect(onMount, [])
  return <>{children}</>
}

function HeroGameInner() {
  const [zzfxProxy, setProxy] = useState<PlaySoundFn | null>(null)
  const [isVisible, setVisible] = useState(true)
  const [loaded, setLoaded] = useState(false)
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
    initAudio()
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <LoadingOverlay visible={!loaded} />
      <div style={{
        width: '100%',
        height: '100%',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 0.5s ease-in',
      }}>
        <Suspense fallback={null}>
          <NotifyMounted onMount={() => setLoaded(true)}>
            <MiniBreakout
              zzfx={zzfxProxy ?? noopZzfx}
              isVisible={isVisible}
              showStats={import.meta.env.DEV}
              onInteraction={handleInteraction}
            />
          </NotifyMounted>
        </Suspense>
      </div>
    </div>
  )
}

/** Gate: reads window.__gpuSupported set by Head inline script. No GPU → render nothing. */
export default function HeroGame() {
  if (typeof window !== 'undefined' && window.__gpuSupported === false) return null
  return <HeroGameInner />
}
