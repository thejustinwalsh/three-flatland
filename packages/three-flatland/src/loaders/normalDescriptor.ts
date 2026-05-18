/**
 * Asset-to-descriptor helpers for the loader side of the normals
 * pipeline.
 *
 * These functions take asset metadata a loader already has (frame
 * rects from a sprite sheet, tile grid + per-tile custom data from a
 * tileset) and emit a list of `NormalRegion`s the baker can consume.
 * Pure functions — no I/O, no filesystem.
 *
 * Descriptor / direction types themselves live in
 * `@three-flatland/normals` so the baker and this module agree on
 * the contract without pulling each other's runtime.
 */

import type {
  NormalBump,
  NormalDirection,
  NormalRegion,
  NormalSourceDescriptor,
} from '@three-flatland/normals'

export type { NormalDirection, NormalBump, NormalRegion, NormalSourceDescriptor }

// ─── Per-cell custom data ────────────────────────────────────────────────

/**
 * Shape the LDtk / Tiled loader extracts from per-tile custom data
 * when synthesizing regions. Authors populate these in the map
 * editor's tile-properties panel.
 *
 * All fields optional — an untagged tile emits a single flat region
 * for its cell. Cap thickness values are in pixels; legacy `*Px`
 * aliases are accepted for back-compat and map to the unsuffixed
 * canonical fields.
 */
export interface TileNormalCustomData {
  /** Screen-space direction the face tilts. See `NormalDirection`. */
  tileDir?: NormalDirection
  /** Alias of `tileDir`. */
  tileDirection?: NormalDirection
  /** Tilt angle override in radians. Inherits descriptor pitch when absent. */
  tilePitch?: number
  /** Bump source override for the face region. */
  tileBump?: NormalBump
  /** Gradient strength override for the face region. */
  tileStrength?: number
  /**
   * Elevation of the tile's primary surface in [0, 1] (0 = ground
   * plane, 1 = top-of-wall):
   *
   *   - Tiles with `tileDir` (wall faces): applies to the face region.
   *     Caps always bake at 1.0 regardless. Default 0.5 (midway up).
   *   - Flat tiles (no `tileDir` or `tileDir: 'flat'`): applies to the
   *     whole cell. Use 1.0 for "all-cap" tiles (wall top viewed
   *     dead-on, roof patches, pillar caps). Unset → descriptor default,
   *     which defaults to 0 (ground plane = floor).
   */
  tileElevation?: number
  /** Cap thickness from the top edge in pixels. */
  tileCapTop?: number
  /** Cap thickness from the bottom edge in pixels. */
  tileCapBottom?: number
  /** Cap thickness from the left edge in pixels. */
  tileCapLeft?: number
  /** Cap thickness from the right edge in pixels. */
  tileCapRight?: number
  /** Shorthand — when no per-edge field is set, treated as `tileCapTop`. */
  tileCap?: number
  /**
   * Corner cap — N×N square flat cap at the top-left corner of the cell.
   * Use when the tile art shows a small flat patch at that corner with
   * the wall face wrapping around it in an L-shape (outer walls facing
   * outward). Composes with edge caps — union of all cap rects is cap,
   * complement is face.
   */
  tileCapTopLeft?: number
  /** N×N square flat cap at the top-right corner. */
  tileCapTopRight?: number
  /** N×N square flat cap at the bottom-left corner. */
  tileCapBottomLeft?: number
  /** N×N square flat cap at the bottom-right corner. */
  tileCapBottomRight?: number
  /** @deprecated alias of `tileCap`. */
  tileCapPx?: number
  /** @deprecated alias of `tileCapTop`. */
  tileCapTopPx?: number
  /** @deprecated alias of `tileCapBottom`. */
  tileCapBottomPx?: number
  /** @deprecated alias of `tileCapLeft`. */
  tileCapLeftPx?: number
  /** @deprecated alias of `tileCapRight`. */
  tileCapRightPx?: number
}

/**
 * Default elevation for a tile's face region — "midway up the wall."
 * Lighting treats this as the Z-axis coordinate of the face in world
 * space, so torches at `lightHeight = 0.75` above the ground see face
 * fragments at elevation 0.5 as slightly below themselves → natural
 * down-lighting onto the face. Override per-tile via `tileElevation`.
 */
export const DEFAULT_FACE_ELEVATION = 0.5

// ─── Sprite sheet ────────────────────────────────────────────────────────

export interface SpriteFrameRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Build one flat region per frame rect. Each region inherits
 * descriptor defaults — most sprite sheets don't need per-frame
 * direction, but individual frames can be overridden by the caller
 * merging custom regions in.
 *
 * Region-local alpha clamping (applied by the baker) is what keeps
 * adjacent frames from bleeding gradients into each other.
 */
export function framesToRegions(frames: SpriteFrameRect[]): NormalRegion[] {
  return frames.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h }))
}

// ─── Single texture ──────────────────────────────────────────────────────

/** Single region covering the whole texture. Used by `TextureLoader`. */
export function wholeTextureRegion(width: number, height: number): NormalRegion[] {
  return [{ x: 0, y: 0, w: width, h: height }]
}

// ─── Tilesets ────────────────────────────────────────────────────────────

export interface TilesetCell {
  /** Pixel x of the top-left of this cell within the tileset atlas. */
  x: number
  /** Pixel y of the top-left of this cell within the tileset atlas. */
  y: number
  /** Cell width in pixels. */
  w: number
  /** Cell height in pixels. */
  h: number
  /** Optional per-tile custom data. Untagged cells emit a single flat region. */
  meta?: TileNormalCustomData
}

/**
 * Build regions for a whole tileset. Each cell becomes one or more
 * regions depending on its custom data — untagged cells emit a single
 * flat region; cells with `tileDirection` + cap fields emit cap strips
 * plus a face region.
 */
export function tilesetToRegions(cells: TilesetCell[]): NormalRegion[] {
  const out: NormalRegion[] = []
  for (const cell of cells) {
    for (const r of tileToRegions(cell, cell.meta)) out.push(r)
  }
  return out
}

/**
 * Synthesize regions for a single tile cell given its custom data.
 *
 * Cap geometry:
 *   - Each of `tileCap{Top,Bottom,Left,Right}` carves a cap strip off
 *     that edge (full width/height).
 *   - Each of `tileCap{TopLeft,TopRight,BottomLeft,BottomRight}` carves
 *     an N×N cap square at that corner — use when the tile art has a
 *     small flat patch in one corner and the wall face wraps around
 *     it in an L-shape (outer walls facing outward).
 *   - `tileCap` shorthand: `tileCapTop` when no per-edge field is set.
 *     The explicit per-edge / per-corner fields always win.
 *   - Cap rects compose by UNION — the cap region is everything any
 *     cap covers, and the face is the complement. Overlapping caps are
 *     harmless (duplicate rects get deduplicated by the baker's
 *     per-texel write).
 *
 * The face area — whatever the cell's interior minus all cap rects —
 * is decomposed into one or more non-overlapping rectangles, each
 * tilted toward `tileDir` with `tilePitch`.
 *
 * When `tileDir` is absent (or equals `'flat'`), the entire cell emits
 * as a single flat region and cap fields are ignored — a flat tile has
 * no face to distinguish from its cap.
 */
export function tileToRegions(
  cell: { x: number; y: number; w: number; h: number },
  meta: TileNormalCustomData | undefined
): NormalRegion[] {
  const direction = meta?.tileDir ?? meta?.tileDirection
  if (!direction || direction === 'flat') {
    // Whole-cell flat region — stays at descriptor-default elevation
    // unless the tile explicitly sets one (e.g., an all-cap tile at
    // elevation 1 for a roof patch or dead-on wall-top view).
    //
    // `tileBump` + `tileStrength` forward through here so flat tiles
    // can still carry per-texel bump detail (stone grout, plank
    // seams, brick mortar on a flat floor). `tileDir` / `tilePitch`
    // are deliberately NOT forwarded — they only make sense on a
    // tilted face.
    const region: NormalRegion = { x: cell.x, y: cell.y, w: cell.w, h: cell.h }
    if (meta?.tileElevation !== undefined) region.elevation = meta.tileElevation
    if (meta?.tileBump !== undefined) region.bump = meta.tileBump
    if (meta?.tileStrength !== undefined) region.strength = meta.tileStrength
    return [region]
  }

  // Resolve canonical-vs-legacy cap fields. Canonical (no `Px`) wins if
  // both are set; otherwise we fall back to the legacy alias.
  const capTopValue = meta?.tileCapTop ?? meta?.tileCapTopPx
  const capBottomValue = meta?.tileCapBottom ?? meta?.tileCapBottomPx
  const capLeftValue = meta?.tileCapLeft ?? meta?.tileCapLeftPx
  const capRightValue = meta?.tileCapRight ?? meta?.tileCapRightPx
  const capShorthand = meta?.tileCap ?? meta?.tileCapPx

  // When any per-edge field is present the shorthand is ignored — the
  // explicit fields are authoritative.
  const usePerEdge =
    capTopValue !== undefined ||
    capBottomValue !== undefined ||
    capLeftValue !== undefined ||
    capRightValue !== undefined

  const capTop = clampCap(usePerEdge ? capTopValue : capShorthand, cell.h)
  const capBottom = clampCap(usePerEdge ? capBottomValue : 0, cell.h - capTop)
  const capLeft = clampCap(capLeftValue, cell.w)
  const capRight = clampCap(capRightValue, cell.w - capLeft)

  // Corner cap squares. Clamp to the smaller of cell dimensions so
  // impossible values can't escape bounds.
  const maxCorner = Math.min(cell.w, cell.h)
  const capTL = clampCap(meta?.tileCapTopLeft, maxCorner)
  const capTR = clampCap(meta?.tileCapTopRight, maxCorner)
  const capBL = clampCap(meta?.tileCapBottomLeft, maxCorner)
  const capBR = clampCap(meta?.tileCapBottomRight, maxCorner)

  // Collect all cap rects. Order matters only for consistent output
  // (the baker treats them independently).
  const capRects: Array<{ x: number; y: number; w: number; h: number }> = []
  if (capTop > 0) capRects.push({ x: cell.x, y: cell.y, w: cell.w, h: capTop })
  if (capBottom > 0) {
    capRects.push({
      x: cell.x,
      y: cell.y + cell.h - capBottom,
      w: cell.w,
      h: capBottom,
    })
  }
  const midY = cell.y + capTop
  const midH = cell.h - capTop - capBottom
  if (capLeft > 0 && midH > 0) {
    capRects.push({ x: cell.x, y: midY, w: capLeft, h: midH })
  }
  if (capRight > 0 && midH > 0) {
    const rightW = Math.min(capRight, cell.w - capLeft)
    if (rightW > 0) {
      capRects.push({
        x: cell.x + cell.w - capRight,
        y: midY,
        w: rightW,
        h: midH,
      })
    }
  }
  if (capTL > 0) capRects.push({ x: cell.x, y: cell.y, w: capTL, h: capTL })
  if (capTR > 0) {
    capRects.push({ x: cell.x + cell.w - capTR, y: cell.y, w: capTR, h: capTR })
  }
  if (capBL > 0) {
    capRects.push({ x: cell.x, y: cell.y + cell.h - capBL, w: capBL, h: capBL })
  }
  if (capBR > 0) {
    capRects.push({
      x: cell.x + cell.w - capBR,
      y: cell.y + cell.h - capBR,
      w: capBR,
      h: capBR,
    })
  }

  // Face = cell minus union(capRects), decomposed into non-overlapping
  // rectangles. Each gets the tile's direction / pitch / bump / strength.
  const faceRects = subtractRects(
    { x: cell.x, y: cell.y, w: cell.w, h: cell.h },
    capRects
  )

  // Caps bake at full elevation (1 = top of wall). Face regions get
  // the tile's `tileElevation` override if set, otherwise
  // `DEFAULT_FACE_ELEVATION` — a midway value that reads as "the wall
  // face sits halfway up the wall" for lighting purposes.
  const regions: NormalRegion[] = capRects.map((rect) => ({ ...rect, elevation: 1 }))
  const faceElevation = meta?.tileElevation ?? DEFAULT_FACE_ELEVATION
  for (const rect of faceRects) {
    const face: NormalRegion = { ...rect, direction, elevation: faceElevation }
    if (meta?.tilePitch !== undefined) face.pitch = meta.tilePitch
    if (meta?.tileBump !== undefined) face.bump = meta.tileBump
    if (meta?.tileStrength !== undefined) face.strength = meta.tileStrength
    regions.push(face)
  }

  // Tiles where caps cover the whole cell (pathological) — emit a
  // single flat region across the cell so the baker still gets
  // coverage. Authors almost certainly made a mistake here, but the
  // defensive path beats a zero-region cell.
  if (regions.length === 0) {
    regions.push({ x: cell.x, y: cell.y, w: cell.w, h: cell.h })
  }

  return regions
}

function clampCap(value: number | undefined, max: number): number {
  if (value === undefined) return 0
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(Math.floor(value), Math.max(0, max))
}

/**
 * Rectangle-minus-rectangles decomposition. Returns a list of
 * non-overlapping axis-aligned rectangles that cover `base \ union(holes)`.
 *
 * Iterative strategy: start with `[base]`; for each hole, replace any
 * rect that intersects with up to four smaller rects surrounding the
 * intersection. Worst case for our input (≤ 8 holes per cell) is small
 * enough that the straightforward algorithm beats a sweep-line
 * decomposition in both code size and speed.
 */
function subtractRects(
  base: { x: number; y: number; w: number; h: number },
  holes: Array<{ x: number; y: number; w: number; h: number }>
): Array<{ x: number; y: number; w: number; h: number }> {
  let current: Array<{ x: number; y: number; w: number; h: number }> = [base]
  for (const hole of holes) {
    const next: Array<{ x: number; y: number; w: number; h: number }> = []
    for (const rect of current) {
      for (const piece of subtractOne(rect, hole)) next.push(piece)
    }
    current = next
    if (current.length === 0) break
  }
  return current
}

function subtractOne(
  rect: { x: number; y: number; w: number; h: number },
  hole: { x: number; y: number; w: number; h: number }
): Array<{ x: number; y: number; w: number; h: number }> {
  const rx2 = rect.x + rect.w
  const ry2 = rect.y + rect.h
  const hx2 = hole.x + hole.w
  const hy2 = hole.y + hole.h
  // Compute intersection. No overlap → rect unchanged.
  const ix = Math.max(rect.x, hole.x)
  const iy = Math.max(rect.y, hole.y)
  const ix2 = Math.min(rx2, hx2)
  const iy2 = Math.min(ry2, hy2)
  if (ix >= ix2 || iy >= iy2) return [rect]
  // Up to four slices of the rect around the intersection.
  const out: Array<{ x: number; y: number; w: number; h: number }> = []
  if (iy > rect.y) out.push({ x: rect.x, y: rect.y, w: rect.w, h: iy - rect.y })
  if (iy2 < ry2) out.push({ x: rect.x, y: iy2, w: rect.w, h: ry2 - iy2 })
  if (ix > rect.x) out.push({ x: rect.x, y: iy, w: ix - rect.x, h: iy2 - iy })
  if (ix2 < rx2) out.push({ x: ix2, y: iy, w: rx2 - ix2, h: iy2 - iy })
  return out
}
