import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber/webgpu'
import { wireSceneStats, type StatsHandle } from '../create-pane.js'

/**
 * Wire a `StatsHandle` (from `usePane`) into R3F's frame loop.
 *
 * Does two things:
 *
 * 1. **Per-frame draws/triangles/GPU timing**: delegates to `wireSceneStats`
 *    from `create-pane.ts`, which hooks `scene.onAfterRender` to capture
 *    `renderer.info.render` / `info.memory` and — when the backend supports
 *    timestamp queries — queues a microtask to drain the GPU timestamp
 *    query pool. Keeping both code paths (vanilla `createPane({ scene })`
 *    and this React hook) on the same helper means GPU mode detection and
 *    pool-drain behave identically no matter how you created the pane.
 *
 * 2. **FPS/MS graph**: wires `stats.begin()` / `stats.end()` via two
 *    `useFrame` calls so the graph measures the full update phase. In R3F
 *    v10 the sort within a phase is `b.priority - a.priority` (higher runs
 *    earlier), so `priority: Infinity` runs first and `priority: -Infinity`
 *    runs last. Both stay in the default `'update'` phase — putting user
 *    jobs in `'render'` makes R3F skip its own auto-render
 *    (`scheduler.hasUserJobsInPhase('render', ...)`).
 */
export function useStatsMonitor(stats: StatsHandle): void {
  const scene = useThree((s) => s.scene)
  const statsRef = useRef(stats)
  statsRef.current = stats

  useEffect(() => {
    const restore = wireSceneStats(scene, statsRef.current, { debug: true })
    return restore
  }, [scene])

  useFrame(() => {
    statsRef.current.begin()
  }, { priority: Infinity })

  useFrame(() => {
    statsRef.current.end()
  }, { priority: -Infinity })
}
