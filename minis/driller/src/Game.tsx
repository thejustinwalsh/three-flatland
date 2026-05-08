import { useCallback, useRef, useState } from 'react'
import { WorldProvider } from 'koota/react'
import { getWorld } from './world'
import { Camera, GameState } from './traits'
import { PlayCanvas } from './components/PlayCanvas'
import { Background } from './components/Background'
import { Scene } from './components/Scene'
import type { DrillerProps } from './types'
import type { PlayCanvasMetrics } from './lib/scale'

/**
 * Driller mini-game root component.
 *
 * Mode-aware composition:
 * - `hero`: Background + PlayCanvas + (UI overlays in Phase 11)
 * - `full`: same plus title attract + leaderboard shells (Phase 12)
 *
 * Phase 4: composes Background + PlayCanvas + empty Scene; verifies that
 * scale-to-fit, parallax, and Flatland render-loop all initialize.
 */
export default function Driller({
  className,
  mode = 'hero',
  isVisible: _isVisible = true,
  zzfx: _zzfx,
  seed: _seed,
}: DrillerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [world] = useState(() => (typeof window !== 'undefined' ? getWorld() : null))

  // Sync mode + canvas metrics into world singletons whenever they change.
  const onMetrics = useCallback(
    (m: PlayCanvasMetrics) => {
      if (!world) return
      const cam = world.get(Camera)
      if (cam) {
        cam.scale = m.scale
        cam.rows = Math.floor(m.canvasHeight / (m.scale * 16))
      }
      const gs = world.get(GameState)
      if (gs) gs.mode = mode
    },
    [world, mode],
  )

  if (!world) return null

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0a0a14',
        overflow: 'hidden',
      }}
    >
      <WorldProvider world={world}>
        <Background />
        <PlayCanvas hostRef={hostRef} onMetrics={onMetrics}>
          <Scene />
        </PlayCanvas>
      </WorldProvider>
    </div>
  )
}
