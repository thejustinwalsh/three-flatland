import { trait } from 'koota'

/**
 * Tile classes (cell values in `Grid.tiles`).
 *
 * `TILE_FIXTURE_BASE..TILE_FIXTURE_BASE+4` are reserved for fixture variants
 * (bone, mushroom shelf, crystal cluster, etc.). All fixture variants behave
 * identically as anchors; only the rendered sprite differs.
 *
 * Fixture codex (mother nature's safe haven): fixtures are INDESTRUCTIBLE.
 * Drill / fall-crush / avalanche-crush / explosive blast all leave fixture
 * cells intact. They block soil falls, block rock falls, and survive bombs.
 * Use `isFixtureTile` everywhere a system has to decide "can I consume this
 * cell?" — never re-derive the range inline (8 ≠ TILE_FIXTURE_BASE+5; the
 * range is exactly +0..+4).
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

/** True if `t` is one of the 5 fixture variants (TILE_FIXTURE_BASE+0..+4). */
export function isFixtureTile(t: number): boolean {
  return t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 5
}

/** Helper — true if the tile anchors adjacent SOIL (used by collapse). */
export function isAnchorTile(t: number): boolean {
  return t === TILE_STONE || t === TILE_ROCK || isFixtureTile(t)
}

/** Reserved bits in `Grid.flags`. */
export const FLAG_SAGGING = 1 << 0
export const FLAG_FALLING = 1 << 1
export const FLAG_AUTOTILE_DIRTY = 1 << 2
/**
 * First phase of the sag lifecycle — set by tickSagging on cells of
 * a SaggingChunk while elapsed < SAG_PRECARIOUS_TICKS. The renderer
 * applies a slight darken (lighter than FLAG_SAGGING) so the player
 * reads "this area is becoming unstable". Cleared at the
 * PRECARIOUS→SAGGING phase transition.
 */
export const FLAG_PRECARIOUS = 1 << 3

/**
 * Stone-disturbance bit. A 4+ rock cluster is otherwise stable; only
 * a destabilising event (driller drills nearby, fresh rock lands on
 * the pile, adjacent soil falls away) sets this bit. Cleared after
 * the avalanche tick processes the cluster.
 *
 * "Naturally occurring" rock clusters from world generation never get
 * this bit set, so they remain inert until the player actually
 * disturbs them.
 */
export const FLAG_DISTURBED = 1 << 4

/**
 * Pre-fall telegraph: a disturbed avalanche cluster shakes for a few
 * hundred ms before committing to its first descent step. The
 * renderer adds a small oscillating offset to cells with this bit so
 * the player has a clear "this is about to fall" visual.
 */
export const FLAG_SHAKING = 1 << 5

/**
 * Set on a SOIL cell when something nearby changes (driller drills,
 * hazard lands, chunk re-attaches, explosion clears, avalanche
 * crush). Acts as a per-tick gate for the cantilever sag detector:
 * a SOIL chunk is only re-evaluated for unstable overhangs if at
 * least one of its cells carries this bit. Fresh worldgen-loaded
 * chunks DON'T get this flag, so they stay stable until the player
 * does something that could destabilise them.
 *
 * detectAndSag clears this bit on a chunk's cells once it processes
 * the chunk; subsequent ticks re-check only on the next mutation.
 */
export const FLAG_SAG_RECHECK = 1 << 6

/**
 * Single-tick grace period for cells that JUST landed via a
 * FallingChunk. The cells stamp into the grid AND propagate
 * SAG_RECHECK into the surrounding terrain (so impact-driven
 * cascades work in the Mr. Driller way), but the LANDED cells
 * themselves are excluded from the unstable-set on the very next
 * detectAndSag pass — otherwise the chunk that just landed gets
 * re-evaluated as the leaf-end of a bigger cantilever and
 * immediately sags again, creating same-tick perpetual loops.
 *
 * Cleared at the END of detectAndSag so the cells are full
 * participants from the NEXT tick onward (with the standard story:
 * detect → darken → shake → fall).
 */
export const FLAG_JUST_LANDED = 1 << 7

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
