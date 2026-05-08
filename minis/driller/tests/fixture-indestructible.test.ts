import { describe, expect, it } from 'vitest'
import { explosiveSystem } from '../src/systems/explosive'
import {
  Driller,
  Explosive,
  Grid,
  TILE_AIR,
  TILE_FIXTURE_BASE,
  TILE_SOIL,
  TILE_STONE,
} from '../src/traits'
import { Animation } from '../src/traits/driller-traits'
import { EXPLOSIVE_FUSE_TICKS } from '../src/constants'
import { makeWorldFromGrid, tickWorld } from './_world-helper'

/**
 * Fixture codex: fixtures are mother nature's safe haven. Drill,
 * fall-crush, avalanche-crush, and explosive blasts must all leave
 * fixture cells intact. The explosive system is the loudest of those
 * paths and the easiest to regress — pin it here.
 */

function spawnExplosiveAndDriller(world: ReturnType<typeof makeWorldFromGrid>): void {
  const grid = world.get(Grid)!
  // Find the explosive cell + a driller cell (driller must be adjacent
  // so the trigger fires on tick 1).
  let explosiveCol = -1
  let explosiveRow = -1
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.tiles[r * grid.cols + c] === 9 /* TILE_EXPLOSIVE */) {
        explosiveCol = c
        explosiveRow = r
      }
    }
  }
  if (explosiveCol < 0) throw new Error('test grid must contain an X (TILE_EXPLOSIVE)')
  world.spawn(
    Explosive({ col: explosiveCol, row: explosiveRow, triggered: false, fuseRemaining: 0 }),
  )
  // Driller in an AIR cell adjacent to the explosive (1 cell west).
  const dCol = explosiveCol - 1
  const dRow = explosiveRow
  world.spawn(
    Driller({
      col: dCol,
      row: dRow,
      px: 0,
      py: 0,
      destCol: dCol,
      destRow: dRow,
      facing: 1,
      drillCooldownMs: 0,
      drillCol: 0,
      drillRow: 0,
    }),
    Animation({ state: 'idle' }),
  )
}

function tickThroughDetonation(world: ReturnType<typeof makeWorldFromGrid>): void {
  // Tick 1: trigger fires. Then EXPLOSIVE_FUSE_TICKS ticks of fuse decrement.
  // Then 1 more tick where fuseRemaining hits 0 and detonation applies.
  for (let i = 0; i < EXPLOSIVE_FUSE_TICKS + 4; i++) {
    explosiveSystem(world)
    tickWorld(world, 1)
  }
}

describe('fixture indestructibility', () => {
  it('explosive blast leaves fixture cells intact', () => {
    // Layout: driller (D) west of explosive (X); fixture (F) directly
    // east of the explosive within blast radius. Phase 2 G also rolled
    // damaged stones (R = pre-damaged STONE) into the same survival
    // class as fresh stones — explosives no longer destroy stones.
    //
    //   . . . . . .
    //   # # # # # .
    //   . D X F R .
    //   # # # # # .
    //   . . . . . .
    const world = makeWorldFromGrid([
      '......',
      '#####.',
      '.DXFR.',
      '#####.',
      '......',
    ])
    spawnExplosiveAndDriller(world)
    const grid = world.get(Grid)!
    const fixtureIdx = 2 * grid.cols + 3 // row 2, col 3 = 'F'
    const stoneIdx = 2 * grid.cols + 4 // row 2, col 4 = 'R' (damaged stone)
    const explosiveIdx = 2 * grid.cols + 2 // row 2, col 2 = 'X'

    expect(grid.tiles[fixtureIdx]).toBe(TILE_FIXTURE_BASE)
    expect(grid.tiles[stoneIdx]).toBe(TILE_STONE)

    tickThroughDetonation(world)

    expect(grid.tiles[fixtureIdx]).toBe(TILE_FIXTURE_BASE) // SURVIVES
    expect(grid.tiles[explosiveIdx]).toBe(TILE_AIR) // detonated
    // Phase 2 G: stones (including damaged ones) survive explosions —
    // the only ways to add hits to a stone are drill + fall-crush.
    expect(grid.tiles[stoneIdx]).toBe(TILE_STONE)
    // Surrounding soil within blast radius vaporized.
    expect(grid.tiles[1 * grid.cols + 2]).toBe(TILE_AIR)
    expect(grid.tiles[3 * grid.cols + 2]).toBe(TILE_AIR)
  })

  it('explosive blast preserves all 5 fixture variants', () => {
    // Variants TILE_FIXTURE_BASE+0..+4 must all survive identically.
    // Codex range is [+0, +4]; cells outside that range must NOT be treated
    // as a fixture.
    for (let variant = 0; variant <= 4; variant++) {
      const world = makeWorldFromGrid([
        '......',
        '#####.',
        '.DX..',
        '#####.',
        '......',
      ])
      const grid = world.get(Grid)!
      // Place the variant in the cell next to the explosive.
      const fixtureIdx = 2 * grid.cols + 3
      grid.tiles[fixtureIdx] = TILE_FIXTURE_BASE + variant
      spawnExplosiveAndDriller(world)
      tickThroughDetonation(world)
      expect(grid.tiles[fixtureIdx]).toBe(TILE_FIXTURE_BASE + variant)
    }
  })

  it('STONE within the blast radius also survives (anchor codex)', () => {
    // Sanity: STONE is the OTHER survivor of an explosion. If a future
    // refactor accidentally drops the stone-survival rule, this test
    // catches it.
    const world = makeWorldFromGrid([
      '......',
      '#####.',
      '.DXS..',
      '#####.',
      '......',
    ])
    spawnExplosiveAndDriller(world)
    const grid = world.get(Grid)!
    const stoneIdx = 2 * grid.cols + 3
    expect(grid.tiles[stoneIdx]).toBe(TILE_STONE)
    tickThroughDetonation(world)
    expect(grid.tiles[stoneIdx]).toBe(TILE_STONE)
  })

  it('SOIL outside the blast radius is untouched', () => {
    // Belt + suspenders: confirm the radius bound is correct so a
    // bug shrinking the bounds doesn't masquerade as "fixtures
    // surviving when actually nothing detonated".
    const world = makeWorldFromGrid([
      '..........',
      '##########',
      '.DX......#',
      '##########',
      '..........',
    ])
    spawnExplosiveAndDriller(world)
    const grid = world.get(Grid)!
    const farSoilIdx = 2 * grid.cols + 9 // far east, well outside radius=2
    expect(grid.tiles[farSoilIdx]).toBe(TILE_SOIL)
    tickThroughDetonation(world)
    expect(grid.tiles[farSoilIdx]).toBe(TILE_SOIL)
  })
})
