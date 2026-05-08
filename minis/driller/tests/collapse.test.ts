import { describe, it, expect } from 'vitest'
import { createWorld } from 'koota'
import { collapseTick, detectAndSag } from '../src/systems/collapse'
import {
  Camera,
  Driller,
  FallingChunk,
  FLAG_SAG_RECHECK,
  FLAG_SAGGING,
  GameState,
  Grid,
  PlannerTarget,
  SaggingChunk,
  TILE_AIR,
  TILE_SOIL,
  TILE_STONE,
} from '../src/traits'

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
    }),
  )
  world.add(Camera({ y: 0, rows: rows, scale: 1 }))
  return world
}

function tagSagRecheck(world: ReturnType<typeof makeWorldFromGrid>): void {
  // Mark every SOIL cell with FLAG_SAG_RECHECK so detectAndSag's
  // gate doesn't skip the chunk.
  const grid = world.get(Grid)!
  for (let i = 0; i < grid.tiles.length; i++) {
    if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
  }
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
    tagSagRecheck(world)
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
    tagSagRecheck(world)
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
    tagSagRecheck(world)
    detectAndSag(world)
    let sagCount = 0
    world.query(SaggingChunk).forEach(() => sagCount++)
    expect(sagCount).toBe(0)
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
    tagSagRecheck(world)
    world.spawn(
      Driller({ col: 7, row: 1, px: 7 * 16 + 8, py: 1 * 16 + 8, destCol: 7, destRow: 1, facing: 1 }),
    )
    world.spawn(PlannerTarget({ col: 7, row: 1, reservedAtTick: 0 }))
    detectAndSag(world)
    let initialSag = 0
    world.query(SaggingChunk).forEach(() => initialSag++)
    expect(initialSag).toBeGreaterThan(0)

    // Tick the world forward past SAG_DURATION_TICKS (90 = PRECARIOUS
    // 36 + SAGGING 36 + SHAKING 18). Use a generous window so the
    // FallingChunk can also resolve.
    const gs = world.get(GameState)!
    for (let i = 0; i < 130; i++) {
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
