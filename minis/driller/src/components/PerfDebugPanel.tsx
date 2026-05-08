import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import { usePane, useStatsMonitor } from '@three-flatland/tweakpane/react'
import { FallingChunk, GameState, SaggingChunk } from '../traits'

interface DrillerStats {
  zeroDisplacementRestores: number
  properLandings: number
}

declare global {
  interface Window {
    __drillerStats?: DrillerStats
  }
}

/**
 * Live performance + codex telemetry panel. Mounted when the URL
 * carries `?debug=perf`. Tweakpane's stats panel (FPS/MS/MEM graph
 * + per-frame draws/triangles/GPU time) is built into `usePane`
 * with `stats: true` (default); we wire it through R3F via
 * `useStatsMonitor`.
 *
 * Adds custom bindings for the shake-codex counters exposed by
 * `src/systems/collapse.ts` via `window.__drillerStats`. Watching
 * `zeroDispRestores` over time is the cheapest live verification
 * that rule 1 (shake → real fall) is holding — if it ticks up
 * during play, the codex has a hole.
 */
export function PerfDebugPanel() {
  const world = useWorld()
  const bundle = usePane({ title: 'driller perf', expanded: true })
  useStatsMonitor(bundle.stats)

  const stateRef = useRef({
    fps60: 0,
    saggingChunks: 0,
    fallingChunks: 0,
    properLandings: 0,
    zeroDispRestores: 0,
    tick: 0,
  })

  useEffect(() => {
    if (!bundle.pane) return
    const folder = bundle.pane.addFolder({ title: 'codex / world', expanded: true })
    const ref = stateRef.current
    const f0 = (v: number) => v.toFixed(0)

    folder.addBinding(ref, 'tick', { readonly: true, label: 'tick', format: f0 })
    folder.addBinding(ref, 'saggingChunks', { readonly: true, label: 'sag entities', format: f0 })
    folder.addBinding(ref, 'fallingChunks', { readonly: true, label: 'fall entities', format: f0 })
    folder.addBinding(ref, 'properLandings', { readonly: true, label: 'landings ✓', format: f0 })
    folder.addBinding(ref, 'zeroDispRestores', {
      readonly: true,
      label: 'rule1 fails ✗',
      format: f0,
    })
    return () => {
      folder.dispose()
    }
  }, [bundle.pane])

  useFrame(() => {
    const ref = stateRef.current
    const gs = world.get(GameState)
    if (gs) ref.tick = gs.tick
    let sag = 0
    world.query(SaggingChunk).forEach(() => sag++)
    ref.saggingChunks = sag
    let fall = 0
    world.query(FallingChunk).forEach(() => fall++)
    ref.fallingChunks = fall
    const stats = window.__drillerStats
    if (stats) {
      ref.properLandings = stats.properLandings
      ref.zeroDispRestores = stats.zeroDisplacementRestores
    }
  })

  return null
}

export function shouldShowPerfDebug(): boolean {
  if (typeof window === 'undefined') return false
  const v = new URLSearchParams(window.location.search).get('debug')
  return v === 'perf' || v === 'all'
}
