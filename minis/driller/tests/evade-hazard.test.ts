import { describe, it, expect } from 'vitest'
import { planEvadeHazard, planGreedy } from '../src/systems/ai-planner'
import { Driller, Hazard, Mood, Gem } from '../src/traits'
import { TILE_PX } from '../src/constants'
import { makeWorldFromGrid } from './_world-helper'

/**
 * Regression coverage for the rock-dance bug + stone-drillability fix.
 *
 * Bug 1 (rock dance): planEvadeHazard used to flag the driller as
 * threatened by any non-landed Hazard in column ±1, regardless of
 * whether the path between rock and driller was actually clear. With
 * a non-AIR cell overhead the rock physically can't reach him, so
 * fleeing was pure waste — and the back-and-forth between flee and
 * resume-greedy looked like a dance.
 *
 * Bug 2 (stone-stuck): planGreedy treated TILE_STONE as a hard block.
 * Driller can drill stones in STONE_MAX_HITS=4 hits; without that
 * awareness he'd pivot sideways forever in front of any stone column.
 */

describe('planEvadeHazard — roof check', () => {
  it('ignores a warning hazard when the driller has a solid roof', () => {
    // Driller at row 8 col 5. Solid soil row directly above (row 7).
    // Hazard telegraphed in the same column at row 1. Rock can't reach.
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '##########', // roof
      '..........', // driller row
      '##########',
    ]
    const world = makeWorldFromGrid(rows)
    world.spawn(Driller({ col: 5, row: 8 }))
    world.spawn(
      Hazard({
        col: 5,
        py: 1 * TILE_PX,
        vy: 0,
        phase: 'warning',
        fallAtTick: 100,
      }),
    )
    const next = planEvadeHazard(world, { col: 5, row: 8 })
    expect(next).toBeNull()
  })

  it('still flees a falling-phase rock with open path', () => {
    // No roof, falling-phase hazard directly overhead → always flee.
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '##########',
    ]
    const world = makeWorldFromGrid(rows)
    world.spawn(Driller({ col: 5, row: 8 }))
    world.spawn(
      Hazard({
        col: 5,
        py: 1 * TILE_PX,
        vy: 4,
        phase: 'falling',
        fallAtTick: 0,
      }),
    )
    const next = planEvadeHazard(world, { col: 5, row: 8 })
    expect(next).not.toBeNull()
    expect(next![1]).toBe(8)
    expect(next![0]).not.toBe(5)
  })

  it('warning at long vertical distance + close gem keeps driller in place', () => {
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '##########',
    ]
    const world = makeWorldFromGrid(rows)
    world.spawn(Driller({ col: 5, row: 8 }))
    // Hazard at row 0 — 8 rows above. Urgency = (15-8)/12 ≈ 0.58.
    world.spawn(
      Hazard({
        col: 5,
        py: 0,
        vy: 0,
        phase: 'warning',
        fallAtTick: 200,
      }),
    )
    // Gem 1 cell away → gemAnchor = 0.7. Default mood greed 0.2 →
    // anchor = 0.7 + 0.2*0.5 = 0.8 > 0.58 → don't flee.
    world.spawn(Gem({ col: 6, row: 8, color: 'emerald', collected: false, scatteredUntilTick: 0 }))
    world.spawn(Mood({ greed: 0.2, fear: 0.1, drive: 0.7, planner: 'greedy', switchAtTick: 0 }))
    const next = planEvadeHazard(world, { col: 5, row: 8 })
    expect(next).toBeNull()
  })

  it('warning at close range overrides anchor', () => {
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '##########',
    ]
    const world = makeWorldFromGrid(rows)
    world.spawn(Driller({ col: 5, row: 8 }))
    // Hazard at row 5 — 3 rows above. Urgency = (15-3)/12 = 1.0.
    // Even with adjacent gem (anchor 0.7) + max greed (greed*0.5 = 0.5),
    // total anchor = 1.2 — actually this would NOT flee.
    // Use row 4 instead — vertical=4, urgency = (15-4)/12 ≈ 0.92, still
    // close. To force flee, drop the gem anchor so total anchor < urgency.
    world.spawn(
      Hazard({
        col: 5,
        py: 5 * TILE_PX,
        vy: 0,
        phase: 'warning',
        fallAtTick: 50,
      }),
    )
    // No gem nearby — gemAnchor = 0. Default greed 0.2 → anchor = 0.1.
    // Urgency = (15-3)/12 = 1.0. Flee.
    world.spawn(Mood({ greed: 0.2, fear: 0.1, drive: 0.7, planner: 'greedy', switchAtTick: 0 }))
    const next = planEvadeHazard(world, { col: 5, row: 8 })
    expect(next).not.toBeNull()
  })
})

describe('planGreedy — drills through stones', () => {
  it('drills down through a stone when no soft path exists', () => {
    // Dance scenario: stone directly below driller, fixtures both sides.
    // Without stone-awareness, planGreedy returned null and the driller
    // dithered. With it, planGreedy targets the stone below to drill.
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '....F.F...', // row 5: F at col4, driller col5, F at col6
      '.....S....', // row 6: stone directly below driller
      '..........',
      '..........',
      '##########',
    ]
    const world = makeWorldFromGrid(rows)
    const next = planGreedy(world, { col: 5, row: 5, facing: 1 })
    expect(next).toEqual([5, 6])
  })

  it('on a fixture with edge+rock, drills the rock', () => {
    // Driller at col 0 row 5 (against the left edge), fixture below,
    // rock to the right. The only escape is drilling the rock.
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      'PS........', // driller col 0, stone col 1
      'FF........', // fixture below
      '..........',
      '..........',
      '##########',
    ]
    // Strip the 'P' placeholder — driller is passed explicitly to planner.
    rows[5] = '.S........'
    const world = makeWorldFromGrid(rows)
    // Facing=1 (right). Forward = right (stone). Drill it.
    const next = planGreedy(world, { col: 0, row: 5, facing: 1 })
    expect(next).toEqual([1, 5])
  })

  it('on a fixture with rock on both sides, drills the facing-side rock', () => {
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '....S.S...', // stones at col 4 and col 6, driller col 5
      '....FFF...', // fixture below
      '..........',
      '..........',
      '##########',
    ]
    const world = makeWorldFromGrid(rows)
    // Facing right → drill right stone.
    const next = planGreedy(world, { col: 5, row: 5, facing: 1 })
    expect(next).toEqual([6, 5])
  })

  it('on a fixture with rock+fixture sides, drills the rock', () => {
    // Left = rock, right = fixture. Forward (right) is fixture → reverse
    // and target the rock on the left.
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '....S.F...', // stone col 4, driller col 5, fixture col 6
      '....FFF...',
      '..........',
      '..........',
      '##########',
    ]
    const world = makeWorldFromGrid(rows)
    const next = planGreedy(world, { col: 5, row: 5, facing: 1 })
    expect(next).toEqual([4, 5])
  })

  it('on a fixture, facing into AIR with rock-blocked side, walks forward (no bounce)', () => {
    // The classic dance: left=AIR, right=rock. Previous behavior: walk
    // left (soft pref), then come back, never drill. New behavior:
    // commit to facing direction. With facing=-1 (left), walk left into
    // AIR. After walking, facing stays -1 and the driller keeps going
    // left instead of reversing.
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '...A.S....', // air col 3, driller col 5 (col 4 = air), stone col 5? wait
      '....FFF...',
      '..........',
      '..........',
      '##########',
    ]
    // Setup: driller (5,5), col 4 = AIR, col 6 = STONE, fixture below.
    rows[5] = '....A.S...'
    const world = makeWorldFromGrid(rows)
    // Facing left (-1). Forward = left = AIR → walk left.
    const next = planGreedy(world, { col: 5, row: 5, facing: -1 })
    expect(next).toEqual([4, 5])
  })

  it('prefers drilling down through a stone over sidestepping into AIR', () => {
    // Greedy = "down at all costs". Even if AIR is open to the sides,
    // a stone below is the preferred target. Without this priority the
    // driller bounces between two AIR cells (the dance) when bracketed
    // by stones/fixtures that close off the sides one tick later, never
    // making progress through the rock that would free him.
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '.....S....', // stone directly below driller at (5,5)
      '..........',
      '..........',
      '##########',
    ]
    const world = makeWorldFromGrid(rows)
    const next = planGreedy(world, { col: 5, row: 5, facing: 1 })
    expect(next).toEqual([5, 6])
  })
})
