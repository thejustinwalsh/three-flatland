import { describe, it, expect } from 'vitest'
import { createWorld } from 'koota'
import { resolveHoverAction, commitAction } from '../src/systems/input'
import { Camera, Driller, GameState, Gem, Grid, Pointer } from '../src/traits'
import { WORLD_BODY_ROWS } from '../src/biomes'

/**
 * Free-fall click-to-collect: while the driller is in the void band
 * between worlds, the player can collect any visible gem with no
 * exact-cell alignment — clicking anywhere resolves to the nearest
 * non-collected gem. Once the driller lands and re-enters the body
 * of the next world, normal exact-cell hover rules return.
 */

function makeMinimalWorld(drillerRow: number) {
  const world = createWorld()
  world.add(GameState({ tick: 0, runState: 'playing', gems: 0 }))
  world.add(
    Grid({
      cols: 18,
      rows: 256,
      topRow: 0,
      bottomRow: 256,
      tiles: new Uint8Array(18 * 256),
      flags: new Uint8Array(18 * 256),
      frameIndex: new Uint8Array(18 * 256),
      hits: new Uint8Array(18 * 256),
      clusterId: new Uint16Array(18 * 256),
      anchorDist: new Uint8Array(18 * 256),
    })
  )
  world.add(Camera({ y: 0, rows: 22, scale: 1 }))
  world.add(Pointer({}))
  world.spawn(
    Driller({ col: 9, row: drillerRow, px: 0, py: 0, destCol: 9, destRow: drillerRow, facing: 1 })
  )
  return world
}

describe('free-fall click-to-collect', () => {
  it('clicking far from a gem during free-fall still collects it (no distance check)', () => {
    // Free-fall: depth in [WORLD_BODY_ROWS, WORLD_LENGTH_ROWS).
    const world = makeMinimalWorld(WORLD_BODY_ROWS + 10) // mid-void

    // Place a gem at (5, 160). Click at (15, 170) — far away.
    const gemEntity = world.spawn(
      Gem({
        col: 5,
        row: 160,
        color: 'emerald',
        size: 'medium',
        collected: false,
        scatteredUntilTick: 0,
      })
    )
    const { action, gemEntity: target } = resolveHoverAction(world, 15, 170)
    expect(action).toBe('collect')
    expect(target).toBe(gemEntity)

    // Commit → gem destroyed, gem count incremented by the medium-gem value (3).
    expect(commitAction(world, action, target)).toBe(true)
    expect(world.get(GameState)!.gems).toBe(3)
    let liveGems = 0
    world.query(Gem).forEach((e) => {
      const g = e.get(Gem)
      if (g && !g.collected) liveGems++
    })
    expect(liveGems).toBe(0)
  })

  it('returns NEAREST gem when multiple are present', () => {
    const world = makeMinimalWorld(WORLD_BODY_ROWS + 5)

    // Two gems: near (4, 160) and far (15, 200). Click at (5, 161) —
    // very close to the first.
    const near = world.spawn(
      Gem({
        col: 4,
        row: 160,
        color: 'emerald',
        size: 'small',
        collected: false,
        scatteredUntilTick: 0,
      })
    )
    world.spawn(
      Gem({
        col: 15,
        row: 200,
        color: 'topaz',
        size: 'small',
        collected: false,
        scatteredUntilTick: 0,
      })
    )
    const { action, gemEntity: target } = resolveHoverAction(world, 5, 161)
    expect(action).toBe('collect')
    expect(target).toBe(near)
  })

  it('does NOT bypass exact-cell rule when driller is in the body (not free-fall)', () => {
    // Driller at row 10 (deep in topsoil body, not void).
    const world = makeMinimalWorld(10)
    world.spawn(
      Gem({
        col: 5,
        row: 12,
        color: 'emerald',
        size: 'medium',
        collected: false,
        scatteredUntilTick: 0,
      })
    )
    // Click 3 cells away — must NOT resolve to collect.
    const { action } = resolveHoverAction(world, 8, 12)
    expect(action).not.toBe('collect')
  })

  it('exact-cell click on the gem still works in free-fall', () => {
    const world = makeMinimalWorld(WORLD_BODY_ROWS + 1)
    const gemEntity = world.spawn(
      Gem({
        col: 7,
        row: 155,
        color: 'ruby',
        size: 'small',
        collected: false,
        scatteredUntilTick: 0,
      })
    )
    const { action, gemEntity: target } = resolveHoverAction(world, 7, 155)
    expect(action).toBe('collect')
    expect(target).toBe(gemEntity)
  })

  it('returns none in free-fall when no live gems exist', () => {
    const world = makeMinimalWorld(WORLD_BODY_ROWS + 20)
    const { action } = resolveHoverAction(world, 5, 170)
    expect(action).toBe('none')
  })
})
