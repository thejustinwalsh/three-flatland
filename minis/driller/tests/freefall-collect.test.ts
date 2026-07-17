import { createWorld } from 'koota'
import { describe, expect, it } from 'vitest'
import { WORLD_BODY_ROWS } from '../src/biomes'
import { FREE_FALL_VACUUM_DURATION_MS, FREE_FALL_VACUUM_RADIUS_PX, TILE_PX } from '../src/constants'
import { gemVacuumSystem, vacuumFreeFallGemSweep } from '../src/systems/gem-vacuum'
import { resolveHoverAction } from '../src/systems/input'
import { Camera, Driller, GameState, Gem, Grid, Pointer } from '../src/traits'
import type { GemSize } from '../src/traits'

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

function gemAt(
  world: ReturnType<typeof makeMinimalWorld>,
  x: number,
  y: number,
  size: GemSize = 'small'
) {
  return world.spawn(
    Gem({
      col: Math.floor(x / TILE_PX),
      row: Math.floor(y / TILE_PX),
      px: x,
      py: y,
      color: 'emerald',
      size,
    })
  )
}

describe('free-fall swipe vacuum', () => {
  it('enters vacuum mode without selecting a gem or drawing a collect target', () => {
    const world = makeMinimalWorld(WORLD_BODY_ROWS + 10)
    gemAt(world, 80, 160)
    const result = resolveHoverAction(world, 15, 170)
    expect(result).toEqual({ action: 'vacuum', gemEntity: null })
  })

  it('catches only gems inside the small finger radius', () => {
    const world = makeMinimalWorld(WORLD_BODY_ROWS + 10)
    const near = gemAt(world, 100, 100 + FREE_FALL_VACUUM_RADIUS_PX - 1)
    const far = gemAt(world, 100, 100 + FREE_FALL_VACUUM_RADIUS_PX + 1)

    expect(vacuumFreeFallGemSweep(world, { x: 100, y: 100 }, { x: 100, y: 100 })).toBe(1)
    expect(near.get(Gem)!.collected).toBe(true)
    expect(far.get(Gem)!.collected).toBe(false)
  })

  it('uses the full swept segment so a fast swipe cannot skip gems', () => {
    const world = makeMinimalWorld(WORLD_BODY_ROWS + 10)
    const first = gemAt(world, 60, 104)
    const second = gemAt(world, 140, 96)
    const outside = gemAt(world, 100, 100 + FREE_FALL_VACUUM_RADIUS_PX + 2)

    expect(vacuumFreeFallGemSweep(world, { x: 20, y: 100 }, { x: 180, y: 100 })).toBe(2)
    expect(first.get(Gem)!.collected).toBe(true)
    expect(second.get(Gem)!.collected).toBe(true)
    expect(outside.get(Gem)!.collected).toBe(false)
  })

  it('pulls, shrinks, then credits each caught gem at the end of the tween', () => {
    const world = makeMinimalWorld(WORLD_BODY_ROWS + 10)
    const gem = gemAt(world, 80, 100, 'medium')
    vacuumFreeFallGemSweep(world, { x: 90, y: 100 }, { x: 90, y: 100 })

    gemVacuumSystem(world, FREE_FALL_VACUUM_DURATION_MS / 2)
    const halfway = gem.get(Gem)!
    expect(halfway.px).toBeGreaterThan(80)
    expect(halfway.px).toBeLessThan(90)
    expect(halfway.collectProgress).toBeCloseTo(0.5)
    expect(world.get(GameState)!.gems).toBe(0)

    gemVacuumSystem(world, FREE_FALL_VACUUM_DURATION_MS / 2)
    expect(world.get(GameState)!.gems).toBe(3)
    expect(world.queryFirst(Gem)).toBe(undefined)
  })

  it('does not vacuum outside the end-of-stage free-fall band', () => {
    const world = makeMinimalWorld(10)
    const gem = gemAt(world, 100, 100)
    expect(vacuumFreeFallGemSweep(world, { x: 100, y: 100 }, { x: 100, y: 100 })).toBe(0)
    expect(gem.get(Gem)!.collected).toBe(false)
    expect(resolveHoverAction(world, 10, 10).action).not.toBe('vacuum')
  })
})
