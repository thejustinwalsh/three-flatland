import { trait } from 'koota'

/**
 * Tile classes (cell values in `Grid.tiles`).
 *
 * `TILE_FIXTURE_BASE..TILE_FIXTURE_BASE+4` are reserved for fixture variants
 * (bone, mushroom shelf, crystal cluster, etc.). All fixture variants behave
 * identically as anchors; only the rendered sprite differs.
 *
 * `TILE_ROCK` is a multi-hit breakable hard tile — anchors soil while intact.
 * `TILE_EXPLOSIVE` triggers on driller adjacency, blows a 5×5 hole.
 */
export const TILE_AIR = 0
export const TILE_SOIL = 1
export const TILE_STONE = 2
export const TILE_FIXTURE_BASE = 3
export const TILE_ROCK = 8
export const TILE_EXPLOSIVE = 9

/** Helper — true if the tile anchors adjacent SOIL (used by collapse). */
export function isAnchorTile(t: number): boolean {
  return (
    t === TILE_STONE ||
    t === TILE_ROCK ||
    (t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 5)
  )
}

/** Reserved bits in `Grid.flags`. */
export const FLAG_SAGGING = 1 << 0
export const FLAG_FALLING = 1 << 1
export const FLAG_AUTOTILE_DIRTY = 1 << 2

/**
 * Singleton tile grid. The world is 18 columns wide (matches `PLAY_COLS`)
 * and grows vertically as chunks stream in. `topRow` and `bottomRow` are
 * absolute row indices in world space (a chunk near the surface has a
 * smaller row index than one in the core biome).
 *
 * `tiles[r * cols + c]` returns one of TILE_AIR / TILE_SOIL / TILE_STONE /
 * TILE_FIXTURE_BASE+variant. `flags[r * cols + c]` carries per-cell state
 * bits (sagging, falling, autotile-dirty).
 *
 * `frameIndex` is parallel to `tiles` and stores the autotile-resolved sprite
 * frame for SOIL cells (computed by the autotile pass). Other tile classes
 * use this slot for their own variant index.
 */
export const Grid = trait({
  cols: 18,
  rows: 0,
  tiles: () => new Uint8Array(0),
  flags: () => new Uint8Array(0),
  frameIndex: () => new Uint8Array(0),
  /** Hit counter for ROCK tiles — non-rock cells stay 0. */
  hits: () => new Uint8Array(0),
  topRow: 0,
  bottomRow: 0,
})
