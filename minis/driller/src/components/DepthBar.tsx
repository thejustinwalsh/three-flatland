import { useEffect, useRef } from 'react'
import { useWorld } from 'koota/react'
import { GameState } from '../traits'
import { WORLD_LENGTH_ROWS } from '../biomes'

/**
 * Vertical depth bar pinned to the right edge of the host. Loops every
 * `WORLD_LENGTH_ROWS` meters (one biome cycle), alternating between an
 * orange "A" pass and a blue/purple "B" pass:
 *
 *   cycle 0 (0–205 m)    → A grows 0→100%, B empty
 *   cycle 1 (205–410 m)  → A stays full (background), B grows on top
 *   cycle 2 (410–615 m)  → B stays full, A grows on top again
 *   ...
 *
 * The "growing" bar always sits at z-index 2 (foreground); the
 * previously-completed bar holds at full height behind it at z-index 1.
 * On each wrap the two swap roles via a z-index juggle so the player
 * sees a fresh color rise over a band representing the lap they just
 * completed. Synchronized with biome wrap (same CYCLE_M).
 */
const CYCLE_M = WORLD_LENGTH_ROWS

const GRADIENT_A = 'linear-gradient(180deg, #fcd34d, #f97316)' // amber → orange
const GRADIENT_B = 'linear-gradient(180deg, #60a5fa, #7c3aed)' // sky → violet
const LABEL_A = '#fcd34d'
const LABEL_B = '#a78bfa'
const GLOW_A = '0 0 8px rgba(252,211,77,0.4)'
const GLOW_B = '0 0 8px rgba(124,58,237,0.4)'

export function DepthBar() {
  const world = useWorld()
  const barARef = useRef<HTMLDivElement>(null)
  const barBRef = useRef<HTMLDivElement>(null)
  const tickRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const gs = world.get(GameState)
      const barA = barARef.current
      const barB = barBRef.current
      const tickEl = tickRef.current
      const label = labelRef.current
      if (gs && barA && barB && tickEl && label) {
        const cycleIndex = Math.floor(gs.depthM / CYCLE_M)
        const cyclePct = (gs.depthM % CYCLE_M) / CYCLE_M
        const aIsForeground = cycleIndex % 2 === 0
        const fgPct = cyclePct * 100
        // Background bar = previous cycle's color, held at 100%.
        // Hidden on cycle 0 (no previous lap).
        const bgPct = cycleIndex > 0 ? 100 : 0

        if (aIsForeground) {
          barA.style.height = `${fgPct}%`
          barA.style.zIndex = '2'
          barB.style.height = `${bgPct}%`
          barB.style.zIndex = '1'
          label.style.color = LABEL_A
        } else {
          barB.style.height = `${fgPct}%`
          barB.style.zIndex = '2'
          barA.style.height = `${bgPct}%`
          barA.style.zIndex = '1'
          label.style.color = LABEL_B
        }

        // Deepest-tick only shown when it sits in the current cycle —
        // otherwise it's referencing a lap that's no longer on screen.
        const deepestCycle = Math.floor(gs.deepestM / CYCLE_M)
        if (deepestCycle === cycleIndex) {
          tickEl.style.display = ''
          const deepPct = (gs.deepestM % CYCLE_M) / CYCLE_M
          tickEl.style.top = `${deepPct * 100}%`
        } else {
          tickEl.style.display = 'none'
        }

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
        ref={barARef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '0%',
          background: GRADIENT_A,
          borderRadius: 7,
          boxShadow: GLOW_A,
          transition: 'height 80ms linear',
          zIndex: 2,
        }}
      />
      <div
        ref={barBRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '0%',
          background: GRADIENT_B,
          borderRadius: 7,
          boxShadow: GLOW_B,
          transition: 'height 80ms linear',
          zIndex: 1,
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
          zIndex: 3,
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
          color: LABEL_A,
          textShadow: '0 1px 2px #000',
        }}
      >
        0m
      </span>
    </div>
  )
}
