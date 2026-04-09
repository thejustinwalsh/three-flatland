import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber/webgpu'
import type { StatsHandle } from '../create-pane.js'

/** Minimal shape of a three.js-ish renderer exposed inside `scene.onAfterRender`. */
interface StatsRenderer {
  info?: {
    render?: {
      drawCalls: number
      triangles: number
      lines: number
      points: number
    }
    memory?: {
      geometries: number
      textures: number
    }
  }
}

/**
 * Wire a `StatsHandle` (from `usePane`) into R3F's frame loop.
 *
 * Does two things:
 *
 * 1. **Per-frame draws/triangles**: hooks `scene.onAfterRender`, which
 *    three.js invokes synchronously from inside `renderer.render()` (see
 *    `Renderer.js:1683`), *after* `info.render.drawCalls` / `.triangles`
 *    are populated and *before* three.js's `Animation` RAF can auto-reset
 *    them next frame. Reading `info.render` from a plain `useFrame`
 *    callback under R3F v10 is racy because the renderer's reset loop runs
 *    out-of-band with R3F's phase graph — you typically see `0`.
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
    // three.js types `onAfterRender` with the Object3D per-object signature,
    // but at the Scene level it's called with a different shape. Chain via
    // a permissive callable type.
    type AnyCallable = (this: unknown, ...args: unknown[]) => void
    const prev = scene.onAfterRender as unknown as AnyCallable
    const hook: AnyCallable = function (this: unknown, ...args) {
      prev.call(this, ...args)
      const renderer = args[0] as StatsRenderer | undefined
      const render = renderer?.info?.render
      const memory = renderer?.info?.memory
      if (render !== undefined || memory !== undefined) {
        statsRef.current.update({
          drawCalls: render?.drawCalls,
          triangles: render?.triangles,
          lines: render?.lines,
          points: render?.points,
          geometries: memory?.geometries,
          textures: memory?.textures,
        })
      }
    }
    ;(scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = hook
    return () => {
      if ((scene as unknown as { onAfterRender: AnyCallable }).onAfterRender === hook) {
        ;(scene as unknown as { onAfterRender: AnyCallable }).onAfterRender = prev
      }
    }
  }, [scene])

  useFrame(() => {
    statsRef.current.begin()
  }, { priority: Infinity })

  useFrame(() => {
    statsRef.current.end()
  }, { priority: -Infinity })
}
