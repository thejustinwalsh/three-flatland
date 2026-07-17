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
 * `TILE_STONE` is the hard-tile class. Stones
 * track damage in `Grid.hits[idx]` — fresh stones have 0 hits, each drill
 * or fall-crush adds 1, and a stone breaks at `>= STONE_MAX_HITS`. Worldgen
 * "speed bump" stones spawn pre-damaged so the driller can drill through
 * them in a single hit.
 *
 * `TILE_EXPLOSIVE` triggers on driller adjacency, blows a 5×5 hole.
 */
export const TILE_AIR = 0
export const TILE_SOIL = 1
export const TILE_STONE = 2
export const TILE_FIXTURE_BASE = 3
export const TILE_EXPLOSIVE = 9

/** True if `t` is one of the 5 fixture variants (TILE_FIXTURE_BASE+0..+4). */
export function isFixtureTile(t: number): boolean {
  return t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 5
}

/** Helper — true if the tile anchors adjacent SOIL (used by collapse). */
export function isAnchorTile(t: number): boolean {
  return t === TILE_STONE || isFixtureTile(t)
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
 * Reserved compatibility bit from the pre-diffusion model. Runtime code
 * uses `Grid.anchorDist` as the source of truth for stability.
 */
export const FLAG_DISTURBED = 1 << 4

/**
 * Pre-fall telegraph: a falling rock cluster shakes for a few hundred
 * ms before committing to its first descent step. The renderer adds
 * a small oscillating offset to cells with this bit so the player
 * has a clear "this is about to fall" visual.
 */
export const FLAG_SHAKING = 1 << 5

/**
 * Reserved compatibility gate from the pre-diffusion model. The sag detector
 * now scans persistent `Grid.anchorDist` values directly.
 */
export const FLAG_SAG_RECHECK = 1 << 6

/**
 * Reserved compatibility bit for the retired 1-tick landing grace. The
 * diffusion model re-derives a landed cell's distance from its neighbors.
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
  /**
   * Cluster id per cell. Non-stone cells stay 0 (no cluster). Stones
   * are grouped into clusters at placement time (worldgen Tetris-
   * shapes; single hazard rocks; merge attempts at hazard land).
   * Two stones with different cluster ids DON'T glom visually
   * (autotile renders strokes between them) and DON'T merge in the
   * avalanche flood-fill — each cluster is an independent doom block,
   * capped at 4×4 bounding box. Without this cap a "frankenglom"
   * could grow to arbitrary size from successive single-rock drops.
   */
  clusterId: () => new Uint16Array(0),
  /**
   * Per-cell anchor distance, persistent across ticks. Driven by the
   * diffusion-based collapse system: pre-settled by a single full BFS
   * on chunk gen, then nudged each tick by `relaxAnchorDist()` toward
   * the true value. Rising stress (becoming less stable) propagates
   * at +1/tick; falling stress (becoming more stable) snaps instantly.
   *
   * 255 = "infinitely far" (no anchor path). 0 = anchor seed cell.
   * SOIL/STONE cells get finite values; AIR is left at 255.
   *
   * Read by the renderer for the cracking gradient visual and by the
   * sag detector to gate the precarious→sagging→shaking pipeline
   * (`anchorDist > MAX_REACH` ⇒ unstable).
   */
  anchorDist: () => new Uint8Array(0),
  topRow: 0,
  bottomRow: 0,
})

/** Sentinel value in `Grid.anchorDist` for "no anchor path / AIR". */
export const ANCHOR_DIST_INF = 255
