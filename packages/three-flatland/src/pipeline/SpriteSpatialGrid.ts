import type { Sprite2D } from '../sprites/Sprite2D'

/**
 * Uniform hash-grid cell size in world units. Tunable — 128 balances
 * cell occupancy against per-sprite cell coverage for typical sprite
 * scales (tens to low hundreds of world units).
 */
export const SPATIAL_GRID_CELL_SIZE = 128

/**
 * Largest cell-index magnitude the grid indexes into. Two bounds in one:
 * indices stay float-safe (a `cx++` at 2^53 stops advancing → infinite loop),
 * and the covered region stays finite. `2^40` cells ≈ 1.4e14 world units at
 * the default cell size — orders of magnitude beyond any real 2D scene (and
 * beyond float32 render precision), so only absurd coordinates/scales clamp.
 */
const MAX_SAFE_CELL = 2 ** 40

/**
 * Cap on the per-axis cell span a single sprite may occupy. A sprite whose
 * AABB is astronomically large would otherwise allocate one cell Set per
 * covered cell (unbounded memory). 256 cells/axis (32768 world units) far
 * exceeds any real sprite; a degenerate one is indexed into a bounded window
 * centred on it (≤ 256² cells — kept small so even a pathological input is
 * cheap, not just finite).
 */
const MAX_CELL_SPAN = 256

/**
 * Clamp a cell index to the float-safe window. `NaN` (a NaN coordinate)
 * passes through and simply produces an empty, non-iterating range.
 */
function clampCell(v: number): number {
  return v < -MAX_SAFE_CELL ? -MAX_SAFE_CELL : v > MAX_SAFE_CELL ? MAX_SAFE_CELL : v
}

/** A sprite's current cell coverage — inclusive cell-index bounds. */
interface CellRange {
  minCx: number
  minCy: number
  maxCx: number
  maxCy: number
}

/** Shared empty result for point queries that land in an unoccupied cell. */
const EMPTY: readonly Sprite2D[] = []

/**
 * Uniform hash grid of `Sprite2D` keyed by world position, used by
 * `SpriteBatch.raycast` as the picking broadphase.
 *
 * Indexing strategy: **multi-cell insert, single-cell query.** Each
 * sprite is inserted into every cell its world AABB overlaps (sprites
 * vary freely in size, so a fixed query neighborhood like a 3×3 block
 * would miss sprites larger than a cell). A point query then reads
 * exactly ONE cell — any sprite whose AABB covers the point must occupy
 * that cell — and since a cell holds each sprite at most once (Set),
 * single-cell queries need no dedup pass at all.
 *
 * The grid is a conservative broadphase: candidates are over-approximate
 * (AABB of the possibly-rotated quad) and the narrow phase
 * (`Sprite2D.raycast`) does the exact hit test.
 *
 * @internal
 */
export class SpriteSpatialGrid {
  private readonly _cellSize: number

  /** Occupancy: `"cx,cy"` → sprites whose AABB overlaps that cell. */
  private readonly _cells = new Map<string, Set<Sprite2D>>()

  /** Reverse index: sprite → its current cell coverage, for O(1) remove. */
  private readonly _ranges = new Map<Sprite2D, CellRange>()

  /**
   * World-Z span of the indexed sprites. The grid is a 2D (xy) structure,
   * but a picking ray localizes at a specific z; under a perspective camera
   * the ray's xy shifts with z, so `SpriteBatch.raycast` must sweep the ray
   * across [`zMin`, `zMax`] to find candidates (see `querySegment`). Grows to
   * include each inserted sprite and is not shrunk on remove — a wider span
   * only widens the swept cell set (still exact after narrow phase), never
   * drops a hit. Empty grid: `zMin > zMax`.
   */
  private _zMin = Infinity
  private _zMax = -Infinity

  constructor(cellSize: number = SPATIAL_GRID_CELL_SIZE) {
    this._cellSize = cellSize
  }

  /** Number of sprites currently indexed. */
  get size(): number {
    return this._ranges.size
  }

  /** Lowest world-Z of any indexed sprite (`Infinity` when empty). */
  get zMin(): number {
    return this._zMin
  }

  /** Highest world-Z of any indexed sprite (`-Infinity` when empty). */
  get zMax(): number {
    return this._zMax
  }

  /**
   * Insert `sprite` covering the world AABB centered at (x, y) with
   * half-extents (hx, hy), at world depth `z`. Re-inserting an
   * already-indexed sprite behaves like {@link update}.
   */
  insert(sprite: Sprite2D, x: number, y: number, hx: number, hy: number, z = 0): void {
    this.update(sprite, x, y, hx, hy, z)
  }

  /**
   * Move `sprite` to the world AABB centered at (x, y) with half-extents
   * (hx, hy), at world depth `z`. No-op when the covered cell range is
   * unchanged (the common static-sprite frame); inserts when the sprite
   * isn't indexed yet.
   */
  update(sprite: Sprite2D, x: number, y: number, hx: number, hy: number, z = 0): void {
    if (z < this._zMin) this._zMin = z
    if (z > this._zMax) this._zMax = z
    const cs = this._cellSize
    // Clamp coverage to a bounded, float-safe cell window. Without this a
    // sprite at absurd world coordinates (index ≥ 2^53) would spin the
    // add/remove loops forever, and a giant AABB would allocate unbounded
    // cell Sets. Realistic sprites sit far inside these bounds untouched.
    let minCx = clampCell(Math.floor((x - hx) / cs))
    let minCy = clampCell(Math.floor((y - hy) / cs))
    let maxCx = clampCell(Math.floor((x + hx) / cs))
    let maxCy = clampCell(Math.floor((y + hy) / cs))
    // Cap the span AROUND the sprite's centre cell (not from the min corner),
    // so a giant AABB still indexes the region a centre-ish pointer will query.
    const half = MAX_CELL_SPAN / 2
    if (maxCx - minCx > MAX_CELL_SPAN) {
      const cCx = clampCell(Math.floor(x / cs))
      minCx = cCx - half
      maxCx = cCx + half
    }
    if (maxCy - minCy > MAX_CELL_SPAN) {
      const cCy = clampCell(Math.floor(y / cs))
      minCy = cCy - half
      maxCy = cCy + half
    }

    const range = this._ranges.get(sprite)
    if (range) {
      if (range.minCx === minCx && range.minCy === minCy && range.maxCx === maxCx && range.maxCy === maxCy) {
        return // Same cells — nothing to re-index.
      }
      this._removeFromCells(sprite, range)
      range.minCx = minCx
      range.minCy = minCy
      range.maxCx = maxCx
      range.maxCy = maxCy
      this._addToCells(sprite, range)
      return
    }

    const fresh: CellRange = { minCx, minCy, maxCx, maxCy }
    this._ranges.set(sprite, fresh)
    this._addToCells(sprite, fresh)
  }

  /** Remove `sprite` from the grid. No-op if it isn't indexed. */
  remove(sprite: Sprite2D): void {
    const range = this._ranges.get(sprite)
    if (!range) return
    this._removeFromCells(sprite, range)
    this._ranges.delete(sprite)
  }

  /**
   * Candidate sprites whose quad could cover the world point (x, y).
   * Reads a single cell (see class doc) — allocation-free beyond the
   * cell-key string; the returned iterable is live grid state, consume
   * immediately without mutating the grid.
   */
  queryPoint(x: number, y: number): Iterable<Sprite2D> {
    const cs = this._cellSize
    return this._cells.get(`${Math.floor(x / cs)},${Math.floor(y / cs)}`) ?? EMPTY
  }

  /**
   * Candidate sprites under the world-space segment from (x0, y0) to
   * (x1, y1) — the projection of a picking ray swept across the batch's
   * z-span. When both ends fall in the same cell (an orthographic camera,
   * or a coplanar batch, collapses the segment to a point) this reads that
   * ONE cell allocation-free, exactly like {@link queryPoint}. Otherwise it
   * unions every cell in the segment's bounding block into a fresh Set —
   * conservative (a few extra cells) but never a miss; the narrow phase
   * filters. Cheap because this runs per pointer event, not per frame.
   */
  querySegment(x0: number, y0: number, x1: number, y1: number): Iterable<Sprite2D> {
    const cs = this._cellSize
    const cx0 = Math.floor(x0 / cs)
    const cy0 = Math.floor(y0 / cs)
    const cx1 = Math.floor(x1 / cs)
    const cy1 = Math.floor(y1 / cs)
    if (cx0 === cx1 && cy0 === cy1) {
      return this._cells.get(`${cx0},${cy0}`) ?? EMPTY
    }
    const minCx = cx0 < cx1 ? cx0 : cx1
    const maxCx = cx0 < cx1 ? cx1 : cx0
    const minCy = cy0 < cy1 ? cy0 : cy1
    const maxCy = cy0 < cy1 ? cy1 : cy0
    const out = new Set<Sprite2D>()
    // A near-grazing ray (tiny dz) can make the swept segment — and thus this
    // cell bounding block — span astronomically many cells, almost all empty.
    // Iterate whichever set is smaller: the block, or the OCCUPIED cells
    // (bounded by the sprite count). The result is identical; only the cost
    // differs. Guards against an unbounded loop / hang on a grazing ray.
    //
    // The block branch also requires float-safe indices: a `cx++` at
    // Number.MAX_SAFE_INTEGER (world coords near 2^53·cellSize) stops
    // advancing and loops forever, so beyond a generous magnitude fall back to
    // the occupied-set branch, whose bound comparisons increment nothing.
    const indicesSafe =
      minCx > -MAX_SAFE_CELL && maxCx < MAX_SAFE_CELL && minCy > -MAX_SAFE_CELL && maxCy < MAX_SAFE_CELL
    const blockCells = (maxCx - minCx + 1) * (maxCy - minCy + 1)
    if (indicesSafe && blockCells <= this._cells.size) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const cell = this._cells.get(`${cx},${cy}`)
          if (cell) for (const s of cell) out.add(s)
        }
      }
    } else {
      for (const [key, cell] of this._cells) {
        const comma = key.indexOf(',')
        const cx = Number(key.slice(0, comma))
        const cy = Number(key.slice(comma + 1))
        if (cx >= minCx && cx <= maxCx && cy >= minCy && cy <= maxCy) {
          for (const s of cell) out.add(s)
        }
      }
    }
    return out
  }

  /** Drop all sprites — used when a batch is recycled or disposed. */
  clear(): void {
    this._cells.clear()
    this._ranges.clear()
    this._zMin = Infinity
    this._zMax = -Infinity
  }

  private _addToCells(sprite: Sprite2D, range: CellRange): void {
    for (let cy = range.minCy; cy <= range.maxCy; cy++) {
      for (let cx = range.minCx; cx <= range.maxCx; cx++) {
        const key = `${cx},${cy}`
        let cell = this._cells.get(key)
        if (!cell) {
          cell = new Set()
          this._cells.set(key, cell)
        }
        cell.add(sprite)
      }
    }
  }

  private _removeFromCells(sprite: Sprite2D, range: CellRange): void {
    for (let cy = range.minCy; cy <= range.maxCy; cy++) {
      for (let cx = range.minCx; cx <= range.maxCx; cx++) {
        const key = `${cx},${cy}`
        const cell = this._cells.get(key)
        if (!cell) continue
        cell.delete(sprite)
        if (cell.size === 0) this._cells.delete(key)
      }
    }
  }
}

/**
 * World AABB half-extents of a sprite's centered unit quad under a 2D
 * affine with linear part [[m00, m01], [m10, m11]] (column-major
 * columns [m00, m10] and [m01, m11]) — exact for any rotation/shear:
 * hx = (|m00| + |m01|) / 2, hy = (|m10| + |m11|) / 2. Inflated when
 * `hitRadius > 0.5` since 'radius' hit-testing can extend beyond the
 * quad. Writes into `out` to stay allocation-free in per-frame loops.
 */
export function quadHalfExtents(
  m00: number,
  m01: number,
  m10: number,
  m11: number,
  hitRadius: number,
  out: { hx: number; hy: number }
): void {
  const inflate = hitRadius > 0.5 ? hitRadius * 2 : 1
  out.hx = ((Math.abs(m00) + Math.abs(m01)) / 2) * inflate
  out.hy = ((Math.abs(m10) + Math.abs(m11)) / 2) * inflate
}
