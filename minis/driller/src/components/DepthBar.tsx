import { useEffect, useRef } from 'react'
import { useWorld } from 'koota/react'
import { GameState } from '../traits'

const DEEPEST_DISPLAY_M = 250 // visual scale: bar full at this depth

/**
 * Vertical depth bar pinned to the right edge of the host. Shows the
 * driller's current depth and a tick mark at the deepest point reached
 * this run.
 */
export function DepthBar() {
  const world = useWorld()
  const fillRef = useRef<HTMLDivElement>(null)
  const tickRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const gs = world.get(GameState)
      const fill = fillRef.current
      const tickEl = tickRef.current
      const label = labelRef.current
      if (gs && fill && tickEl && label) {
        const pct = Math.min(1, gs.depthM / DEEPEST_DISPLAY_M)
        const deepPct = Math.min(1, gs.deepestM / DEEPEST_DISPLAY_M)
        fill.style.height = `${pct * 100}%`
        tickEl.style.top = `${deepPct * 100}%`
        label.textContent = `${gs.depthM}m`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world])

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: 12,
        bottom: 12,
        width: 14,
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 7,
        }}
      />
      <div
        ref={fillRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '0%',
          background: 'linear-gradient(180deg, #fcd34d, #f97316)',
          borderRadius: 7,
          boxShadow: '0 0 8px rgba(252,211,77,0.4)',
          transition: 'height 80ms linear',
        }}
      />
      <div
        ref={tickRef}
        style={{
          position: 'absolute',
          left: -3,
          right: -3,
          height: 2,
          background: '#ffffff',
          borderRadius: 1,
          boxShadow: '0 0 4px #ffffff',
          top: '0%',
        }}
      />
      <span
        ref={labelRef}
        style={{
          position: 'absolute',
          right: 24,
          top: 0,
          fontSize: 11,
          fontFamily: 'monospace',
          color: '#fcd34d',
          textShadow: '0 1px 2px #000',
        }}
      >
        0m
      </span>
    </div>
  )
}
