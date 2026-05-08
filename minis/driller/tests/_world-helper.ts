import { createWorld } from 'koota'
import {
  Camera,
  GameState,
  Grid,
  TILE_AIR,
  TILE_EXPLOSIVE,
  TILE_FIXTURE_BASE,
  TILE_ROCK,
  TILE_SOIL,
  TILE_STONE,
} from '../src/traits'

/**
 * String-art grid → Koota world helper.
 *
 *   '.' = AIR
 *   '#' = SOIL
 *   'S' = STONE
 *   'R' = ROCK (multi-hit)
 *   'X' = EXPLOSIVE
 *   'F' = FIXTURE (variant 0)
 */
export function makeWorldFromGrid(art: string[]) {
  const rows = art.length
  const firstRow = art[0]
  const cols = firstRow ? firstRow.length : 0
  const tiles = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    const rowStr = art[r]
    if (!rowStr) continue
    for (let c = 0; c < cols; c++) {
      const ch = rowStr[c]
      const t =
        ch === '#' ? TILE_SOIL
        : ch === 'S' ? TILE_STONE
        : ch === 'R' ? TILE_ROCK
        : ch === 'X' ? TILE_EXPLOSIVE
        : ch === 'F' ? TILE_FIXTURE_BASE
        : TILE_AIR
      tiles[r * cols + c] = t
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
  world.add(Camera({ y: 0, rows, scale: 1 }))
  return world
}

export function tickWorld(world: ReturnType<typeof makeWorldFromGrid>, n = 1): void {
  const gs = world.get(GameState)!
  world.set(GameState, { tick: gs.tick + n })
}
