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

  it('triggers in the ±1 halo of an active hazard (not just directly under)', () => {
    // Driller at col 5, hazard at col 6 (one cell to the right). The
    // old rule only triggered when h.col === d.col; the new halo rule
    // triggers any time the hazard is within ±1 col. This is what
    // makes the driller commit to fleeing further out, instead of
    // relaxing one cell over and getting yanked back into the threat
    // zone by greedy.
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
        col: 6, // one column to the right of driller
        py: 1 * TILE_PX,
        vy: 0,
        phase: 'falling',
        fallAtTick: 0,
      }),
    )
    const next = planEvadeHazard(world, { col: 5, row: 8 })
    expect(next).not.toBeNull()
    // Flee target must be OUTSIDE the halo of col 6 — i.e., col 6-2=4
    // or lower (left) or col 6+2=8 or higher (right). The closer side
    // wins (left, since col 5 is adjacent to col 4 which is just
    // outside the halo).
    expect(next![0]).toBeLessThanOrEqual(4)
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

  it('prefers sidestepping into AIR + drilling soil below over drilling a stone straight down', () => {
    // Cost-based greedy: a STONE drill costs 4 hits; a SOIL drill costs
    // 1. So when down is stone but a sidestep into AIR opens a soil
    // path below, the side route is 2 cost (1 step + 1 drill) vs 4
    // cost (direct stone drill). Side wins.
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........', // driller at (5,5), row 5 is all AIR
      '.....S....', // stone directly below driller
      '..........', // soil/air below — both sides have soft descent
      '..........',
      '##########',
    ]
    // Make rows around row 6 mostly SOIL so the side-down path resolves
    // to soft descent (cost 1+1=2).
    rows[6] = '....#S#...'
    rows[7] = '..........'
    const world = makeWorldFromGrid(rows)
    const next = planGreedy(world, { col: 5, row: 5, facing: 1 })
    expect(next).not.toBeNull()
    // Sidesteps to col 4 or 6 (NOT [5,6] direct stone).
    expect(next).not.toEqual([5, 6])
    expect([4, 5, 6]).toContain(next![0])
    expect(next![1]).toBe(5)
  })

  it('treats hazard-halo columns as impassable so greedy never steps back into the threat zone', () => {
    // Driller has fled one cell left of an active hazard. Without the
    // hazard-aware passability gate, greedy's cost-based descent would
    // see the original tunnel column (which has soft descent) and step
    // RIGHT back toward the hazard — the dance. With the gate, that
    // column is ∞ cost, so the driller's only viable move is DOWN at
    // the safe column (or further left).
    //
    //   . . . . . .  row 4 (driller here, just fled left from col 4)
    //   . . . . . .  row 5
    //   . . . . . .  row 6 — all SOIL below (soft descent)
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '##########',
      '##########',
      '##########',
      '##########',
      '##########',
    ]
    const world = makeWorldFromGrid(rows)
    // Hazard at col 4, driller at col 3 (one cell left, in halo).
    world.spawn(
      Hazard({
        col: 4,
        py: 0,
        vy: 0,
        phase: 'falling',
        fallAtTick: 0,
      }),
    )
    const next = planGreedy(world, { col: 3, row: 4, facing: -1 })
    expect(next).not.toBeNull()
    // The blocked halo is cols 3, 4, 5. col 3 (driller's column) is in
    // the halo, so DOWN is ∞ too. The only viable step is sideways to
    // col 2 (outside halo). Greedy must NOT pick col 4 or 5 (in halo).
    expect(next![0]).toBeLessThanOrEqual(2)
  })

  it('drills straight down through SOIL when the side detour is more expensive', () => {
    // Direct DOWN soft = 1, sidestep + side-down = 2. Down wins.
    const rows = [
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........', // driller at (5,5)
      '..........', // all AIR / SOIL below
      '..........',
      '..........',
      '##########',
    ]
    rows[6] = '##########' // soil below driller
    const world = makeWorldFromGrid(rows)
    const next = planGreedy(world, { col: 5, row: 5, facing: 1 })
    expect(next).toEqual([5, 6])
  })
})
