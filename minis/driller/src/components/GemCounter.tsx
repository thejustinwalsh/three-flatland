import { useEffect, useRef } from 'react'
import { useWorld } from 'koota/react'
import { GameState } from '../traits'

/**
 * Top-left pill showing the gem currency pouch. Pulses on collect.
 */
export function GemCounter() {
  const world = useWorld()
  const labelRef = useRef<HTMLSpanElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const lastCount = useRef(0)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const gs = world.get(GameState)
      const label = labelRef.current
      const pill = pillRef.current
      if (gs && label && pill) {
        if (gs.gems !== lastCount.current) {
          label.textContent = String(gs.gems)
          if (gs.gems > lastCount.current) {
            pill.style.animation = 'none'
            // Force reflow then restart animation
            void pill.offsetWidth
            pill.style.animation = 'driller-gem-pulse 280ms ease-out'
          }
          lastCount.current = gs.gems
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world])

  return (
    <>
      <style>{`
        @keyframes driller-gem-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.18); }
          100% { transform: scale(1); }
        }
      `}</style>
      <div
        ref={pillRef}
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          padding: '6px 10px',
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(6px)',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: 'monospace',
          color: '#a78bfa',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: 14 }}>◆</span>
        <span ref={labelRef}>0</span>
      </div>
    </>
  )
}
