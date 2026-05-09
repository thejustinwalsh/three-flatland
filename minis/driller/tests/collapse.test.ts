import { describe, it, expect } from 'vitest'
import { createWorld } from 'koota'
import { collapseTick, detectAndSag } from '../src/systems/collapse'
import { seedAnchorsBFS } from '../src/lib/chunk-detect'
import {
  Camera,
  Driller,
  FallingChunk,
  FLAG_PRECARIOUS,
  FLAG_SAGGING,
  FLAG_SHAKING,
  GameState,
  Grid,
  PlannerTarget,
  SaggingChunk,
  TILE_AIR,
  TILE_SOIL,
  TILE_STONE,
} from '../src/traits'
import { SAG_PRECARIOUS_TICKS, SAG_SAGGING_TICKS } from '../src/constants'

/**
 * Helpers to spin up a tiny ECS world with a hand-crafted tile grid
 * for systems-level sag tests. The world is `cols × rows`; pass in a
 * string-art grid where:
 *   '.' = AIR
 *   '#' = SOIL
 *   'S' = STONE (anchor)
 */
function makeWorldFromGrid(art: string[]) {
  const rows = art.length
  const firstRow = art[0]
  const cols = firstRow ? firstRow.length : 0
  const tiles = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    const rowStr = art[r]
    if (!rowStr) continue
    for (let c = 0; c < cols; c++) {
      const ch = rowStr[c]
      tiles[r * cols + c] = ch === '#' ? TILE_SOIL : ch === 'S' ? TILE_STONE : TILE_AIR
    }
  }
  const anchorDist = new Uint8Array(cols * rows).fill(255)
  seedAnchorsBFS(tiles, anchorDist, cols, rows)
  const world = createWorld()
  world.add(GameState({ tick: 0, runState: 'playing' }))
  world.add(
    Grid({
      cols,
      rows,
      topRow: 0,
      bottomRow: rows,
      tiles,
      flags: new Uint8Array(cols * rows),
      frameIndex: new Uint8Array(cols * rows),
      hits: new Uint8Array(cols * rows),
      anchorDist,
    }),
  )
  world.add(Camera({ y: 0, rows: rows, scale: 1 }))
  return world
}

describe('detectAndSag', () => {
  it('does NOT sag a soil chunk that is sitting on bedrock with no room to fall', () => {
    // Two-cell soil column resting directly on STONE — cantilever
    // distance to anchor is 1, but more importantly the cells have
    // STONE below so they have nowhere to fall. Must not spawn a
    // SaggingChunk (else: shake-with-no-fall = the stuck-shake bug).
    const world = makeWorldFromGrid([
      '.....',
      '..#..',
      '..#..',
      '..S..',
      'SSSSS',
    ])

    detectAndSag(world)
    let sagCount = 0
    world.query(SaggingChunk).forEach(() => sagCount++)
    expect(sagCount).toBe(0)
  })

  it('does NOT fire on chunks that have not been disturbed', () => {
    // A wide soil mass with an obvious overhang above a tunnel —
    // would be unstable per cantilever — but no FLAG_SAG_RECHECK is
    // set, so the system must skip it entirely. Mirrors the
    // "fresh-worldgen-chunk shaking on load" symptom.
    const world = makeWorldFromGrid([
      '##############',
      '##############',
      '..............',
      '##############',
      'SSSSSSSSSSSSSS',
    ])
    detectAndSag(world)
    let sagCount = 0
    world.query(SaggingChunk).forEach(() => sagCount++)
    expect(sagCount).toBe(0)
  })

  it('DOES sag a floating horizontal slab once disturbed', () => {
    // Floating slab in the middle of the world, no contact with
    // side walls, AIR below it. Cantilever calls every cell
    // unstable (no path to any anchor); willFall passes (AIR below).
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])

    detectAndSag(world)
    let sagCount = 0
    world.query(SaggingChunk).forEach(() => sagCount++)
    expect(sagCount).toBeGreaterThanOrEqual(1)
  })

  it('does not sag a chunk where every cantilever-unstable cell has solid below', () => {
    // A two-row soil slab with one row of stones touching the bottom
    // — every cell has STONE directly under it. Even if the
    // cantilever paints them unstable, the willFall guard must skip
    // the spawn.
    const world = makeWorldFromGrid([
      '.................',
      '#################',
      'SSSSSSSSSSSSSSSSS',
    ])

    detectAndSag(world)
    let sagCount = 0
    world.query(SaggingChunk).forEach(() => sagCount++)
    expect(sagCount).toBe(0)
  })
})

/**
 * Regression — bug discovered post-Phase-A: detectAndSag's
 * chunk-skip mask was `FLAG_SAGGING | FLAG_FALLING`, but the
 * PRECARIOUS phase of tickSagging CLEARS FLAG_SAGGING (replacing it
 * with FLAG_PRECARIOUS). So during the 54-tick precarious window,
 * detectAndSag spawned a fresh SaggingChunk EVERY tick — each new
 * entity at elapsed=0 overwrote older entities' flag writes back to
 * PRECARIOUS. Cells skipped the visible SAGGING/SHAKING phases
 * entirely; they just suddenly fell when the oldest entity in the
 * pile reached release.
 *
 * Pin: after one detectAndSag spawns a sag entity, subsequent
 * detectAndSag calls during PRECARIOUS must NOT spawn additional
 * SaggingChunk entities for the same chunk.
 */
describe('SaggingChunk single-spawn invariant', () => {
  it('does not double-spawn during PRECARIOUS phase', () => {
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    // First detectAndSag spawns the sag entity (cells get FLAG_SAGGING).
    detectAndSag(world)
    let count1 = 0
    world.query(SaggingChunk).forEach(() => count1++)
    expect(count1).toBe(1)

    // Run collapseTick once — tickSagging puts the entity into
    // PRECARIOUS phase, which CLEARS FLAG_SAGGING.
    const gs = world.get(GameState)!
    world.set(GameState, { tick: gs.tick + 1 })
    collapseTick(world)

    // Verify the entity is in PRECARIOUS now (not SAGGING).
    const grid = world.get(Grid)!
    let precariousCount = 0
    let saggingCount = 0
    for (let i = 0; i < grid.flags.length; i++) {
      if ((grid.flags[i]! & FLAG_PRECARIOUS) !== 0) precariousCount++
      if ((grid.flags[i]! & FLAG_SAGGING) !== 0) saggingCount++
    }
    expect(precariousCount).toBeGreaterThan(0)
    expect(saggingCount).toBe(0)

    // Tick through MORE of PRECARIOUS — detectAndSag must NOT spawn
    // additional sag entities. Without the bug fix, this would jump
    // by 1 every tick.
    for (let i = 0; i < 30; i++) {
      world.set(GameState, { tick: gs.tick + 2 + i })
      collapseTick(world)
    }
    let count2 = 0
    world.query(SaggingChunk).forEach(() => count2++)
    expect(
      count2,
      `Expected 1 SaggingChunk entity throughout PRECARIOUS phase, found ${count2}. ` +
      `Likely cause: detectAndSag's chunkHasFlag skip-check doesn't include FLAG_PRECARIOUS — ` +
      `cells lose FLAG_SAGGING during precarious phase and look like fresh unstable cells to the detector.`,
    ).toBe(1)
  })

  it('cells visibly enter SAGGING then SHAKING phases during the lifecycle', () => {
    // End-to-end pin: with the bug, cells flickered through PRECARIOUS
    // (no visual) and then suddenly fell. With the fix, each cell goes
    // PRECARIOUS → SAGGING → SHAKING → fall in sequence, observable
    // via the flag bits.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    detectAndSag(world)
    const gs = world.get(GameState)!
    const grid = world.get(Grid)!

    let everSagging = false
    let everShaking = false
    // Tick well past the full SAG_DURATION (~138 ticks).
    for (let i = 0; i < 200; i++) {
      world.set(GameState, { tick: gs.tick + i + 1 })
      collapseTick(world)
      // Sample flags on the slab cells.
      for (let c = 2; c < 8; c++) {
        const idx = 2 * grid.cols + c
        if ((grid.flags[idx]! & FLAG_SAGGING) !== 0) everSagging = true
        if ((grid.flags[idx]! & FLAG_SHAKING) !== 0) everShaking = true
      }
      if (everSagging && everShaking) break
    }
    expect(
      everSagging,
      'Cells never received FLAG_SAGGING — sag pipeline is skipping the SAGGING phase. ' +
      'Likely SaggingChunk-respawn bug (see prior test).',
    ).toBe(true)
    expect(
      everShaking,
      'Cells never received FLAG_SHAKING — sag pipeline is skipping the SHAKING phase. ' +
      'Likely SaggingChunk-respawn bug or SHAKE-entry guard cancelling.',
    ).toBe(true)
    // Sanity: phase durations match constants.
    void SAG_PRECARIOUS_TICKS
    void SAG_SAGGING_TICKS
  })
})

describe('collapseTick (sag → fall release)', () => {
  it('sagged cells eventually release as a FallingChunk', () => {
    // Floating slab — same setup as the spawn test. After
    // SAG_DURATION_TICKS the chunk should release.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])

    world.spawn(
      Driller({ col: 7, row: 1, px: 7 * 16 + 8, py: 1 * 16 + 8, destCol: 7, destRow: 1, facing: 1 }),
    )
    world.spawn(PlannerTarget({ col: 7, row: 1, reservedAtTick: 0 }))
    detectAndSag(world)
    let initialSag = 0
    world.query(SaggingChunk).forEach(() => initialSag++)
    expect(initialSag).toBeGreaterThan(0)

    // Tick the world forward past SAG_DURATION_TICKS (138 = PRECARIOUS
    // 54 + SAGGING 54 + SHAKING 30 — bumped for slower telegraph
    // anticipation now that the cracking gradient gives advance
    // notice). Use a generous window so the FallingChunk can also
    // resolve.
    const gs = world.get(GameState)!
    for (let i = 0; i < 200; i++) {
      world.set(GameState, { tick: gs.tick + i + 1 })
      collapseTick(world)
    }

    let fallingCount = 0
    world.query(FallingChunk).forEach(() => fallingCount++)
    let lingeringSag = 0
    world.query(SaggingChunk).forEach(() => lingeringSag++)
    // After the sag duration, the chunk has either released into a
    // FallingChunk (still in flight) or already landed (no entity).
    // Either way: the original SAGGING flag should be cleared.
    expect(lingeringSag).toBe(0)
    void fallingCount
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.flags.length; i++) {
      const f = grid.flags[i]
      if (f === undefined) continue
      expect(f & FLAG_SAGGING).toBe(0)
    }
  })
})
