/**
 * Authoritative on-disk layout for the `FL_slug_font` GLB extension.
 *
 * Single source of truth shared by the runtime reader (`baked.ts`) and the
 * baker (`bake.ts`): the schema version, the extension name, and the ordered
 * list of named glTF accessor columns with their accessor types. Both sides
 * derive the column set from `SLUG_COLUMNS`, so read and write cannot drift —
 * the baker emits exactly these columns and the reader looks each up by name.
 */

/** Extension name in the GLB JSON chunk + `extensionsUsed`/`extensionsRequired`. */
export const SLUG_EXTENSION_NAME = 'FL_slug_font'

/**
 * Current `FL_slug_font` schema version, written by the baker and gated by the
 * reader. Bump ONLY on layout-incompatible changes; additive changes (new
 * optional accessors/fields) keep this version. A reader refuses a file whose
 * version exceeds what it supports, so a future bump fails loudly with a clear
 * message instead of misreading.
 */
export const SLUG_FONT_VERSION = 1

/** glTF accessor element type for a column. */
export type SlugColumnType = 'SCALAR' | 'VEC2' | 'VEC4'

/**
 * Every named accessor in the extension's `columns` map, in emit order, with
 * its glTF accessor type. The baker emits exactly these; the reader resolves
 * each by name. Glyph SoA columns are parallel arrays (entry `i` = the `i`-th
 * glyph in ascending-glyphId order); `bandOffsets` is an N+1 CSR prefix-sum of
 * word indices into the flat `bandData`; `curveTexture`/`bandTexture` hold the
 * raw GPU texture words (format declared in the extension metadata).
 */
export const SLUG_COLUMNS = [
  { name: 'glyphId', type: 'SCALAR' },
  { name: 'bounds', type: 'VEC4' },
  { name: 'bandLoc', type: 'VEC2' },
  { name: 'advanceWidth', type: 'SCALAR' },
  { name: 'lsb', type: 'SCALAR' },
  { name: 'hasOutline', type: 'SCALAR' },
  { name: 'cmap', type: 'VEC2' },
  { name: 'kern', type: 'SCALAR' },
  { name: 'bandOffsets', type: 'SCALAR' },
  { name: 'bandData', type: 'SCALAR' },
  { name: 'curveTexture', type: 'SCALAR' },
  { name: 'bandTexture', type: 'SCALAR' },
] as const satisfies ReadonlyArray<{ name: string; type: SlugColumnType }>

/** Union of column names. */
export type SlugColumnName = (typeof SLUG_COLUMNS)[number]['name']

// ---------------------------------------------------------------------------
// FL_slug_shapes — baked `SlugShapeSet` container (`.shapes.glb`)
// ---------------------------------------------------------------------------

/** Extension name for baked shape sets (`packShapeSet` / `SlugShapeSet.fromBaked`). */
export const SLUG_SHAPES_EXTENSION_NAME = 'FL_slug_shapes'

/**
 * Current `FL_slug_shapes` schema version. Same policy as
 * `SLUG_FONT_VERSION`: bump ONLY on layout-incompatible changes; the reader
 * refuses newer files loudly.
 */
export const SLUG_SHAPES_VERSION = 1

/**
 * Accessor columns for a baked shape set, SoA over shapes sorted ascending
 * by shape id. The format is **geometry-complete**: curves + contour starts
 * + prebuilt bands round-trip losslessly, so a loaded set needs no SVG
 * parsing and no band building — only the (linear-copy) texture pack — and
 * stays growable via `registerShape` after load.
 *
 * - `shapeId`  FLOAT SCALAR (N) — ascending shape ids
 * - `bounds`   FLOAT VEC4  (N) — xMin yMin xMax yMax, normalized shape space
 * - `curveOffsets`   FLOAT SCALAR (N+1) — CSR prefix-sum, in CURVES, into `curveData`
 * - `curveData`      FLOAT SCALAR (totalCurves × 6) — p0x p0y p1x p1y p2x p2y
 * - `contourOffsets` FLOAT SCALAR (N+1) — CSR prefix-sum into `contourStarts`
 * - `contourStarts`  FLOAT SCALAR — per-shape contour start indices (curve indices)
 * - `bandOffsets`    FLOAT SCALAR (N+1) — CSR word offsets into `bandData`
 * - `bandData`       USHORT SCALAR — per-shape band words, same layout as
 *   `FL_slug_font`: [numH, numV, hCounts…, hIndices…, vCounts…, vIndices…]
 */
export const SLUG_SHAPE_COLUMNS = [
  { name: 'shapeId', type: 'SCALAR' },
  { name: 'bounds', type: 'VEC4' },
  { name: 'curveOffsets', type: 'SCALAR' },
  { name: 'curveData', type: 'SCALAR' },
  { name: 'contourOffsets', type: 'SCALAR' },
  { name: 'contourStarts', type: 'SCALAR' },
  { name: 'bandOffsets', type: 'SCALAR' },
  { name: 'bandData', type: 'SCALAR' },
] as const satisfies ReadonlyArray<{ name: string; type: SlugColumnType }>

/** Union of shape column names. */
export type SlugShapeColumnName = (typeof SLUG_SHAPE_COLUMNS)[number]['name']
