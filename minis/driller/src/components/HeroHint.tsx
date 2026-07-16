import { useEffect, useRef, useState } from 'react'
import { useWorld } from 'koota/react'
import { Pointer } from '../traits'

/**
 * Ghosted "tap anywhere to help" hint shown at first-load in hero mode.
 * Fades out after 4s OR the first user interaction, whichever comes first.
 */
export function HeroHint() {
  const world = useWorld()
  const [visible, setVisible] = useState(true)
  const interactedRef = useRef(false)

  useEffect(() => {
    if (!visible) return

    // Auto-fade after 4s.
    const timer = window.setTimeout(() => setVisible(false), 4000)

    // Also fade on first interaction.
    let raf = 0
    const tick = () => {
      const ptr = world.get(Pointer)
      if (ptr && ptr.hoverAction !== 'none' && !interactedRef.current) {
        interactedRef.current = true
        setVisible(false)
      }
      if (visible) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [visible, world])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        fontSize: 10,
        fontFamily: 'monospace',
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        pointerEvents: 'none',
        zIndex: 5,
        animation: 'driller-hint-fade 800ms ease-out',
      }}
    >
      <style>{`
        @keyframes driller-hint-fade {
          from { opacity: 0; }
          to { opacity: 0.55; }
        }
      `}</style>
      tap anywhere to help
    </div>
  )
}
