import { createWorld } from 'koota'
import {
  Camera,
  GameState,
  Grid,
  TILE_AIR,
  TILE_EXPLOSIVE,
  TILE_FIXTURE_BASE,
  TILE_SOIL,
  TILE_STONE,
} from '../src/traits'
import { STONE_MAX_HITS } from '../src/constants'

/**
 * String-art grid → Koota world helper.
 *
 *   '.' = AIR
 *   '#' = SOIL
 *   'S' = STONE (fresh, hits=0)
 *   'R' = STONE pre-damaged to STONE_MAX_HITS - 1 (one drill from
 *         breaking — the spiritual successor of the old TILE_ROCK)
 *   'X' = EXPLOSIVE
 *   'F' = FIXTURE (variant 0)
 */
export function makeWorldFromGrid(art: string[]) {
  const rows = art.length
  const firstRow = art[0]
  const cols = firstRow ? firstRow.length : 0
  const tiles = new Uint8Array(cols * rows)
  const hits = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    const rowStr = art[r]
    if (!rowStr) continue
    for (let c = 0; c < cols; c++) {
      const ch = rowStr[c]
      const idx = r * cols + c
      let t: number = TILE_AIR
      if (ch === '#') t = TILE_SOIL
      else if (ch === 'S') t = TILE_STONE
      else if (ch === 'R') {
        t = TILE_STONE
        hits[idx] = STONE_MAX_HITS - 1
      } else if (ch === 'X') t = TILE_EXPLOSIVE
      else if (ch === 'F') t = TILE_FIXTURE_BASE
      tiles[idx] = t
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
      hits,
    }),
  )
  world.add(Camera({ y: 0, rows, scale: 1 }))
  return world
}

export function tickWorld(world: ReturnType<typeof makeWorldFromGrid>, n = 1): void {
  const gs = world.get(GameState)!
  world.set(GameState, { tick: gs.tick + n })
}
