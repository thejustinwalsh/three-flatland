import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Entity } from 'koota'
import { usePane } from '@three-flatland/tweakpane/react'
import { Driller, GameState, Gem, Hazard, Mood, PlannerTarget } from '../traits'

/**
 * Live Tweakpane readout of the AI's behavioral state. Lives inside
 * the R3F Canvas (alongside Scene) so it can poll the Koota world via
 * `useFrame` without an extra reconciliation cycle. Every binding is
 * `readonly` — this is purely a debug surface, not a controller.
 *
 * Toggle visibility with `?debug=ai` in the URL — left off by default
 * so the hero panel stays clean.
 */
export function AIDebugPanel() {
  const world = useWorld()
  const { pane } = usePane()
  const stateRef = useRef({
    runState: '—',
    tick: 0,
    depthM: 0,
    gems: 0,
    cell: '—',
    dest: '—',
    px: 0,
    py: 0,
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
    if (!pane) return
    const folder = pane.addFolder({ title: 'Driller AI', expanded: true })
    const ref = stateRef.current

    const f3 = (v: number) => v.toFixed(3)
    const f1 = (v: number) => v.toFixed(1)
    const f0 = (v: number) => v.toFixed(0)

    folder.addBinding(ref, 'runState', { readonly: true, label: 'state' })
    folder.addBinding(ref, 'tick', { readonly: true, label: 'tick', format: f0 })
    folder.addBinding(ref, 'depthM', { readonly: true, label: 'depth', format: f0 })
    folder.addBinding(ref, 'gems', { readonly: true, label: 'gems', format: f0 })

    const motion = folder.addFolder({ title: 'motion', expanded: true })
    motion.addBinding(ref, 'cell', { readonly: true, label: 'cell' })
    motion.addBinding(ref, 'dest', { readonly: true, label: 'dest' })
    motion.addBinding(ref, 'px', { readonly: true, label: 'px', format: f1 })
    motion.addBinding(ref, 'py', { readonly: true, label: 'py', format: f1 })
    motion.addBinding(ref, 'drillCD', { readonly: true, label: 'drill ms', format: f0 })
    motion.addBinding(ref, 'drillTarget', { readonly: true, label: 'drill →' })

    const ai = folder.addFolder({ title: 'planning', expanded: true })
    ai.addBinding(ref, 'planner', { readonly: true, label: 'planner' })
    ai.addBinding(ref, 'target', { readonly: true, label: 'target' })

    const mood = folder.addFolder({ title: 'mood', expanded: true })
    mood.addBinding(ref, 'moodGreed', { readonly: true, label: 'greed', format: f3, view: 'graph', min: 0, max: 1 })
    mood.addBinding(ref, 'moodFear', { readonly: true, label: 'fear', format: f3, view: 'graph', min: 0, max: 1 })
    mood.addBinding(ref, 'moodDrive', { readonly: true, label: 'drive', format: f3, view: 'graph', min: 0, max: 1 })

    const signals = folder.addFolder({ title: 'signals', expanded: true })
    signals.addBinding(ref, 'visibleGems', { readonly: true, label: 'gems<6', format: f0 })
    signals.addBinding(ref, 'activeHazards', { readonly: true, label: 'rocks', format: f0 })

    return () => { folder.dispose() }
  }, [pane])

  useFrame(() => {
    const ref = stateRef.current
    const gs = world.get(GameState)
    if (gs) {
      ref.runState = gs.runState
      ref.tick = gs.tick
      ref.depthM = gs.depthM
      ref.gems = gs.gems
    }

    let dEntity: Entity | undefined
    world.query(Driller).forEach((e: Entity) => { if (!dEntity) dEntity = e })
    if (dEntity) {
      const d = dEntity.get(Driller)!
      ref.cell = `${d.col},${d.row}`
      ref.dest = `${d.destCol},${d.destRow}`
      ref.px = d.px
      ref.py = d.py
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

    let moodEntity: Entity | undefined
    world.query(Mood).forEach((e: Entity) => { if (!moodEntity) moodEntity = e })
    if (moodEntity) {
      const m = moodEntity.get(Mood)!
      ref.moodGreed = m.greed
      ref.moodFear = m.fear
      ref.moodDrive = m.drive
      ref.planner = m.planner
    }

    let hazardCount = 0
    world.query(Hazard).forEach((e) => {
      const h = e.get(Hazard)
      if (h && h.phase !== 'landed') hazardCount++
    })
    ref.activeHazards = hazardCount
  })

  return null
}

export function shouldShowAIDebug(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('debug') === 'ai'
}
