import type { Matrix4, Vector2Tuple } from 'three'

/**
 * The layout grid — a power of two so `1/128` is exactly representable in binary float
 * (`1/100` is not). At scale 100 every JS float64 <-> Yoga float32 crossing re-truncated
 * with representation error and the derived matrix position "swam"; at 128 the snapped
 * values are exact, so a deterministic layout stays byte-identical across relayouts.
 *
 * The single source of truth: `quantize` (the snap) and `nearEqual` (the change test)
 * both derive from this. Tune the grid here.
 */
export const LAYOUT_GRID = 128

/** One grid cell — the near-equal tolerance. */
export const EPSILON = 1 / LAYOUT_GRID

/**
 * Snap `x` onto a grid, round-to-nearest — Yoga's own native pixel scheme. The POSITION
 * read/write snap. `grid` defaults to {@link LAYOUT_GRID}; pass a finer grid (e.g.
 * `LAYOUT_GRID * 2`) for a half-cell quantity like a centered box's center, which lands
 * exactly on the 1/256 grid and must not be nudged onto the coarser 1/128 grid.
 */
export const quantize = (x: number, grid: number = LAYOUT_GRID): number =>
  Math.round(x * grid) / grid

/**
 * Snap a SIZE onto the grid, rounding UP (never down) — mirrors Yoga's own measure-func ceil
 * (`Math.ceil(w * PointScaleFactor)`). Rounding a min-content size down forces unnecessary
 * text line breaks / clipping, so sizes always round toward "never clip". Pair with an exact
 * `===` relayout gate: a one-cell change in the snapped size is a genuine layout change,
 * whereas a distance tolerance ({@link nearEqual}) would miss a sub-cell delta that still
 * crosses a cell boundary and changes the committed layout.
 */
export const ceilQuantize = (x: number): number => Math.ceil(x * LAYOUT_GRID) / LAYOUT_GRID

/**
 * Distance-based "did it move?" test: `a` and `b` are within one grid cell. The
 * change-detection operator for RENDER dirty-checks — "has this position/matrix moved enough
 * to re-upload?" — where a cell-boundary discontinuity would itself cause jitter. Distance-
 * based on purpose. NOTE: this is the WRONG tool for the relayout gate (see flex/node.ts),
 * which asks "will Yoga produce a different layout?" — a step function of the SNAPPED size,
 * so it compares {@link ceilQuantize}d values exactly. "Did it move" and "should it
 * relayout" are different questions with different operators.
 */
export const nearEqual = (a: number, b: number): boolean => Math.abs(a - b) < EPSILON

/** {@link nearEqual} over a `Vector2Tuple` — every component within EPSILON. */
export const nearEqualVector2 = (a: Vector2Tuple, b: Vector2Tuple): boolean =>
  nearEqual(a[0], b[0]) && nearEqual(a[1], b[1])

/**
 * {@link nearEqual} over all 16 elements of a `Matrix4`. Callers must pass matrices whose
 * translation lives in the same space as the grid — a world-space matrix scaled by a tiny
 * `pixelSize` needs a scaled tolerance, not the layout default.
 */
export const nearEqualMatrix4 = (a: Matrix4, b: Matrix4): boolean => {
  const ae = a.elements
  const be = b.elements
  for (let i = 0; i < 16; i++) {
    if (!nearEqual(ae[i]!, be[i]!)) {
      return false
    }
  }
  return true
}
