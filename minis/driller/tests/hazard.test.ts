import { describe, it, expect } from 'vitest'
import {
  hazardSpawnSystem,
  hazardTickSystem,
  resetAvalanche,
  resetHazardSpawn,
  setHazardSafeMinRow,
} from '../src/systems/hazard'
import {
  Driller,
  GameState,
  Grid,
  Hazard,
  TILE_AIR,
  TILE_STONE,
} from '../src/traits'
import { TILE_PX } from '../src/constants'
import { makeWorldFromGrid, tickWorld } from './_world-helper'

function spawnDriller(world: ReturnType<typeof makeWorldFromGrid>, col: number, row: number) {
  world.spawn(
    Driller({
      col, row,
      px: col * TILE_PX + TILE_PX / 2,
      py: row * TILE_PX + TILE_PX / 2,
      destCol: col, destRow: row,
      facing: 1, drillCooldownMs: 0, drillCol: 0, drillRow: 0,
    }),
  )
}

function countHazards(world: ReturnType<typeof makeWorldFromGrid>): number {
  let n = 0
  world.query(Hazard).forEach(() => n++)
  return n
}

describe('hazard spawn rules', () => {
  it('does not spawn rocks while the column above the driller is solid', () => {
    // Driller at row 5, no AIR column above — no rock should spawn.
    // Use a 14x14 grid filled with SOIL except the driller's cell.
    const grid: string[] = []
    for (let r = 0; r < 14; r++) {
      grid.push('##############')
    }
    const world = makeWorldFromGrid(grid)
    // Carve only the driller's cell.
    const g = world.get(Grid)!
    g.tiles[5 * 14 + 7] = TILE_AIR
    spawnDriller(world, 7, 5)
    resetHazardSpawn()
    // Run many spawn ticks — interval and depth boost don't matter
    // because no candidate column has the required AIR-down-to-driller.
    // Force-disable spawn cooldown by setting tick high.
    for (let t = 0; t < 200; t++) {
      tickWorld(world, 1)
      hazardSpawnSystem(world)
    }
    expect(countHazards(world)).toBe(0)
  })

  it('post-respawn cooldown blocks spawns until driller drills past the safety row', () => {
    // Driller at row 5 with a clear AIR chute above + soil below.
    // Set safety row to 8 — driller at 5 < 8, no spawn.
    const grid: string[] = []
    for (let r = 0; r < 18; r++) {
      grid.push('##############')
    }
    const world = makeWorldFromGrid(grid)
    const g = world.get(Grid)!
    // Carve a chute from row 0 down to row 9 in the driller's column.
    for (let r = 0; r <= 9; r++) g.tiles[r * 14 + 7] = TILE_AIR
    spawnDriller(world, 7, 5)
    // Set the world depth deeper so the biome is past topsoil and
    // boost > 0 (otherwise the early-return on boost catches us).
    const driller = world.queryFirst(Driller)!
    driller.set(Driller, { row: 200 })
    // Re-carve at the new row.
    for (let r = 195; r <= 210; r++) g.tiles[r * 14 + 7] = TILE_AIR
    setHazardSafeMinRow(220)
    resetHazardSpawn()
    for (let t = 0; t < 600; t++) {
      tickWorld(world, 1)
      hazardSpawnSystem(world)
    }
    expect(countHazards(world)).toBe(0)
  })

  it('debris hazards do NOT deposit a stone on landing', () => {
    // Spawn a debris hazard above SOIL — it falls, lands, must NOT
    // leave a STONE behind.
    const grid: string[] = []
    for (let r = 0; r < 8; r++) grid.push('..............')
    grid[6] = '##############'
    grid[7] = '##############'
    const world = makeWorldFromGrid(grid)
    spawnDriller(world, 7, 7)
    world.spawn(
      Hazard({
        col: 5,
        py: 1 * 16 + 8, // start near top
        vy: 0,
        phase: 'falling',
        fallAtTick: 0,
        isDebris: true,
      }),
    )
    resetAvalanche()
    for (let t = 0; t < 60; t++) {
      tickWorld(world, 1)
      hazardTickSystem(world)
    }
    // The hazard should be despawned; no STONE should appear in the
    // column above the soil.
    const finalGrid = world.get(Grid)!
    for (let r = 0; r < 6; r++) {
      expect(finalGrid.tiles[r * 14 + 5]).not.toBe(TILE_STONE)
    }
  })
})
