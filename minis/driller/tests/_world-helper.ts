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
      clusterId: assignClusterIds(tiles, cols, rows),
    }),
  )
  world.add(Camera({ y: 0, rows, scale: 1 }))
  return world
}

export function tickWorld(world: ReturnType<typeof makeWorldFromGrid>, n = 1): void {
  const gs = world.get(GameState)!
  world.set(GameState, { tick: gs.tick + n })
}

/**
 * Build a clusterId Uint16Array by flood-filling connected stones.
 * Each 4-connected component of TILE_STONE gets its own id (1, 2, …);
 * non-stone cells stay 0. Used by tests so the avalanche system's
 * cluster-id-aware flood-fill treats hand-drawn stones the way the
 * test author intended (touching stones share a cluster, separated
 * stones don't).
 */
function assignClusterIds(tiles: Uint8Array, cols: number, rows: number): Uint16Array<ArrayBuffer> {
  const ids = new Uint16Array(new ArrayBuffer(cols * rows * 2))
  let next = 1
  const stack: number[] = []
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== TILE_STONE || ids[i] !== 0) continue
    const id = next++
    stack.length = 0
    stack.push(i)
    ids[i] = id
    while (stack.length) {
      const idx = stack.pop()!
      const c = idx % cols
      const r = (idx - c) / cols
      const ns: number[] = []
      if (c > 0) ns.push(idx - 1)
      if (c < cols - 1) ns.push(idx + 1)
      if (r > 0) ns.push(idx - cols)
      if (r < rows - 1) ns.push(idx + cols)
      for (const ni of ns) {
        if (tiles[ni] === TILE_STONE && ids[ni] === 0) {
          ids[ni] = id
          stack.push(ni)
        }
      }
    }
  }
  return ids
}
