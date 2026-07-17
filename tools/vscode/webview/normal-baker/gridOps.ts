// Pure grid→regions and region-splitting math for the baker's atlas-style
// slicing (C3) — no DOM, no store; unit-tested in gridOps.test.ts. The
// GridSpec shape (and the overlay that edits it) is tools/preview's
// GridSliceOverlay, consumed as-is; this module only owns what the baker
// DOES with an aligned grid.
import { cellExtent, cellKey, type GridSpec } from '@three-flatland/preview/grid'
import type { NormalRegion } from '@three-flatland/normals'
import type { EditableRegion } from './regionOps'
import type { OverridableField } from './fieldResolution'

export type TileRect = { x: number; y: number; w: number; h: number }

/**
 * One rect per grid cell, row-major (the descriptor's natural reading
 * order). Zero-area cells — edges collapsed together by image-bounds
 * clamping (e.g. a tile size that doesn't divide the image, leaving the
 * trailing edge pinned) — are dropped rather than emitted as degenerate
 * regions.
 */
export function tilesFromGrid(grid: GridSpec): TileRect[] {
  const rows = grid.rowEdges.length - 1
  const cols = grid.colEdges.length - 1
  const out: TileRect[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ext = cellExtent(grid, r, c)
      if (ext.w > 0 && ext.h > 0) out.push(ext)
    }
  }
  return out
}

/**
 * Rects for a picked subset of cells (GridSliceOverlay's `cellKey` set),
 * row-major regardless of pick order — region order is paint order in the
 * descriptor, and a stable spatial order is what a tilemap author expects
 * from a bulk generate. Keys out of the grid's current range (stale picks
 * from before a re-align shrank the grid) are ignored.
 */
export function tilesFromPicked(grid: GridSpec, picked: ReadonlySet<string>): TileRect[] {
  const rows = grid.rowEdges.length - 1
  const cols = grid.colEdges.length - 1
  const out: TileRect[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!picked.has(cellKey(r, c))) continue
      const ext = cellExtent(grid, r, c)
      if (ext.w > 0 && ext.h > 0) out.push(ext)
    }
  }
  return out
}

/**
 * Photoshop's "slice using guides", scoped to one region: cut the region
 * along every grid edge that passes strictly through its interior. The
 * children PARTITION the parent exactly — remainder slivers where the
 * region's own bounds sit between grid lines become (smaller) children
 * rather than being dropped, so no pixel of the parent is lost and none
 * is covered twice. A region no grid line crosses yields a single child
 * equal to the parent (callers treat length 1 as "nothing to split").
 */
export function splitRegionByGrid(region: TileRect, grid: GridSpec): TileRect[] {
  const xs = cutPositions(region.x, region.w, grid.colEdges)
  const ys = cutPositions(region.y, region.h, grid.rowEdges)
  const out: TileRect[] = []
  for (let r = 0; r < ys.length - 1; r++) {
    for (let c = 0; c < xs.length - 1; c++) {
      out.push({ x: xs[c]!, y: ys[r]!, w: xs[c + 1]! - xs[c]!, h: ys[r + 1]! - ys[r]! })
    }
  }
  return out
}

/** Region-bound endpoints + every edge strictly inside the span, sorted. */
function cutPositions(start: number, size: number, edges: readonly number[]): number[] {
  const end = start + size
  const inside = edges.filter((e) => e > start && e < end)
  return [start, ...inside, end]
}

/**
 * Split a region into `rows` × `cols` children with integer edges. The
 * remainder of a non-divisible span distributes across the children via
 * per-edge rounding (a 10px span over 3 cols yields widths 3/4/3), so no
 * single edge tile silently absorbs it all. Counts clamp to at least 1;
 * children never exceed the parent's bounds; degenerate (zero-size)
 * children — more cuts than pixels — are dropped.
 */
export function splitRegionRowsCols(region: TileRect, rows: number, cols: number): TileRect[] {
  const r = Math.max(1, Math.floor(rows))
  const c = Math.max(1, Math.floor(cols))
  const xs = Array.from({ length: c + 1 }, (_, i) => region.x + Math.round((i * region.w) / c))
  const ys = Array.from({ length: r + 1 }, (_, i) => region.y + Math.round((i * region.h) / r))
  const out: TileRect[] = []
  for (let ri = 0; ri < r; ri++) {
    for (let ci = 0; ci < c; ci++) {
      const w = xs[ci + 1]! - xs[ci]!
      const h = ys[ri + 1]! - ys[ri]!
      if (w > 0 && h > 0) out.push({ x: xs[ci]!, y: ys[ri]!, w, h })
    }
  }
  return out
}

const OVERRIDABLE_FIELDS: readonly OverridableField[] = ['bump', 'direction', 'pitch', 'strength', 'elevation']

/**
 * Materializes split children from a parent region: each child takes one
 * tile's bounds plus the parent's EXPLICIT overridable fields — presence
 * in the region is explicitness (N4 fidelity semantics; see
 * fieldResolution.ts's header). A field the parent inherited from the
 * descriptor stays omitted on the children too, so they keep inheriting
 * live rather than having today's default frozen into them.
 */
export function childrenFromSplit(
  parent: EditableRegion,
  tiles: readonly TileRect[],
  makeId: () => string
): EditableRegion[] {
  const inherited: Partial<NormalRegion> = {}
  for (const field of OVERRIDABLE_FIELDS) {
    if (parent[field] !== undefined) {
      // Widening through Partial<NormalRegion> — each field's value came
      // off the same-named parent field, so the pairing is type-correct.
      ;(inherited as Record<string, unknown>)[field] = parent[field]
    }
  }
  return tiles.map((tile) => ({ id: makeId(), ...inherited, ...tile }))
}
