import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Entity } from 'koota'
import { usePane, useStatsMonitor } from '@three-flatland/tweakpane/react'
import {
  Driller,
  FallingChunk,
  GameState,
  Gem,
  Hazard,
  Mood,
  PlannerTarget,
  SaggingChunk,
} from '../traits'
import { getRenderMode, setRenderMode } from '../dev/render-mode'

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
 * Unified live debug panel — perf graphs, codex telemetry, AI state,
 * and render-mode toggles in a single tweakpane window. Mounted when
 * the URL carries `?debug` (any value). Lives inside the R3F Canvas
 * so it can poll the Koota world via `useFrame` cheaply.
 *
 * Folder layout (perf expanded by default; the rest collapsed so the
 * panel stays out of the way until you reach for it):
 *
 *   perf            — FPS / MS / MEM stats + sag/fall entity counts +
 *                     codex counters (rule-1 fail count especially)
 *   AI              — driller cell, dest, drill cooldown, planner,
 *                     mood axes, signals
 *   render          — anchor-heatmap toggle, future debug-render
 *                     buttons go here
 *
 * All bindings are `readonly` except the render-mode buttons.
 */
export function DebugPanel() {
  const world = useWorld()
  const bundle = usePane({ title: 'driller debug', expanded: true })
  useStatsMonitor(bundle.stats)

  const stateRef = useRef({
    // perf / codex
    tick: 0,
    saggingChunks: 0,
    fallingChunks: 0,
    properLandings: 0,
    zeroDispRestores: 0,
    // AI
    runState: '—',
    depthM: 0,
    gems: 0,
    cell: '—',
    dest: '—',
    drillCD: 0,
    drillTarget: '—',
    planner: '—',
    target: '—',
    moodGreed: 0,
    moodFear: 0,
    moodDrive: 0,
    visibleGems: 0,
    activeHazards: 0,
  })

  useEffect(() => {
    if (!bundle.pane) return
    const ref = stateRef.current
    const f0 = (v: number) => v.toFixed(0)
    const f3 = (v: number) => v.toFixed(3)

    // ---- perf / codex (expanded) ----
    const perf = bundle.pane.addFolder({ title: 'perf / codex', expanded: true })
    perf.addBinding(ref, 'tick', { readonly: true, label: 'tick', format: f0 })
    perf.addBinding(ref, 'saggingChunks', { readonly: true, label: 'sag entities', format: f0 })
    perf.addBinding(ref, 'fallingChunks', { readonly: true, label: 'fall entities', format: f0 })
    perf.addBinding(ref, 'properLandings', { readonly: true, label: 'landings ✓', format: f0 })
    perf.addBinding(ref, 'zeroDispRestores', {
      readonly: true,
      label: 'rule1 fails ✗',
      format: f0,
    })

    // ---- AI (collapsed) ----
    const ai = bundle.pane.addFolder({ title: 'AI', expanded: false })
    ai.addBinding(ref, 'runState', { readonly: true, label: 'state' })
    ai.addBinding(ref, 'depthM', { readonly: true, label: 'depth', format: f0 })
    ai.addBinding(ref, 'gems', { readonly: true, label: 'gems', format: f0 })
    ai.addBinding(ref, 'cell', { readonly: true, label: 'cell' })
    ai.addBinding(ref, 'dest', { readonly: true, label: 'dest' })
    ai.addBinding(ref, 'drillCD', { readonly: true, label: 'drill ms', format: f0 })
    ai.addBinding(ref, 'drillTarget', { readonly: true, label: 'drill →' })
    ai.addBinding(ref, 'planner', { readonly: true, label: 'planner' })
    ai.addBinding(ref, 'target', { readonly: true, label: 'target' })
    ai.addBinding(ref, 'moodGreed', {
      readonly: true,
      label: 'greed',
      format: f3,
      view: 'graph',
      min: 0,
      max: 1,
    })
    ai.addBinding(ref, 'moodFear', {
      readonly: true,
      label: 'fear',
      format: f3,
      view: 'graph',
      min: 0,
      max: 1,
    })
    ai.addBinding(ref, 'moodDrive', {
      readonly: true,
      label: 'drive',
      format: f3,
      view: 'graph',
      min: 0,
      max: 1,
    })
    ai.addBinding(ref, 'visibleGems', { readonly: true, label: 'gems<6', format: f0 })
    ai.addBinding(ref, 'activeHazards', { readonly: true, label: 'rocks', format: f0 })

    // ---- render (collapsed) ----
    const render = bundle.pane.addFolder({ title: 'render', expanded: false })
    render
      .addButton({ title: 'toggle anchor heatmap' })
      .on('click', () => {
        const next = getRenderMode() === 'anchor-heatmap' ? 'normal' : 'anchor-heatmap'
        setRenderMode(next)
      })

    return () => {
      perf.dispose()
      ai.dispose()
      render.dispose()
    }
  }, [bundle.pane])

  useFrame(() => {
    const ref = stateRef.current
    const gs = world.get(GameState)
    if (gs) {
      ref.tick = gs.tick
      ref.runState = gs.runState
      ref.depthM = gs.depthM
      ref.gems = gs.gems
    }

    // Entity counts
    let sag = 0
    world.query(SaggingChunk).forEach(() => sag++)
    ref.saggingChunks = sag
    let fall = 0
    world.query(FallingChunk).forEach(() => fall++)
    ref.fallingChunks = fall

    // Codex counters
    const stats = window.__drillerStats
    if (stats) {
      ref.properLandings = stats.properLandings
      ref.zeroDispRestores = stats.zeroDisplacementRestores
    }

    // Driller state
    let dEntity: Entity | undefined
    world.query(Driller).forEach((e: Entity) => {
      if (!dEntity) dEntity = e
    })
    if (dEntity) {
      const d = dEntity.get(Driller)!
      ref.cell = `${d.col},${d.row}`
      ref.dest = `${d.destCol},${d.destRow}`
      ref.drillCD = d.drillCooldownMs
      ref.drillTarget = d.drillCooldownMs > 0 ? `${d.drillCol},${d.drillRow}` : '—'
      const target = dEntity.get(PlannerTarget)
      ref.target = target ? `${target.col},${target.row}` : '—'
      let visible = 0
      world.query(Gem).forEach((entity) => {
        const g = entity.get(Gem)
        if (!g || g.collected || g.scatteredUntilTick > 0) return
        if (Math.abs(g.col - d.col) + Math.abs(g.row - d.row) <= 6) visible++
      })
      ref.visibleGems = visible
    } else {
      ref.cell = '—'
      ref.dest = '—'
      ref.target = '—'
    }

    // Mood
    let moodEntity: Entity | undefined
    world.query(Mood).forEach((e: Entity) => {
      if (!moodEntity) moodEntity = e
    })
    if (moodEntity) {
      const m = moodEntity.get(Mood)!
      ref.moodGreed = m.greed
      ref.moodFear = m.fear
      ref.moodDrive = m.drive
      ref.planner = m.planner
    }

    // Hazards in flight
    let hazardCount = 0
    world.query(Hazard).forEach((e) => {
      const h = e.get(Hazard)
      if (h && h.phase !== 'landed') hazardCount++
    })
    ref.activeHazards = hazardCount
  })

  return null
}

/**
 * URL gate: any `?debug` param (with or without a value) opens the
 * panel. Backward-compatible with the previous `?debug=ai` and
 * `?debug=perf` flags.
 */
export function shouldShowDebugPanel(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('debug')
}
