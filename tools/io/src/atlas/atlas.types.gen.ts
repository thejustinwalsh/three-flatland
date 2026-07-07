// AUTO-GENERATED — DO NOT EDIT. Regenerate with `pnpm gen:types`.
// Source: packages/schemas/src/atlas/schema.json
// Generator: scripts/gen-schema-types.ts (json-schema-to-typescript)
// Exported type: AtlasJson

/**
 * @minItems 2
 * @maxItems 2
 */
export type Vec2Tuple = [number, number]

/**
 * Sidecar JSON for a sprite atlas image. STRICT superset of TexturePacker's JSON-Hash format AND Aseprite's JSON export — every file emitted by either validates here. The root keys are `frames` + `meta` only (matching TP/Aseprite); all our additions live under `meta` because `meta` is the open extension bucket (`additionalProperties: true`). Aseprite's `meta.frameTags` / `meta.layers` / `meta.slices` validate as-is; we add `meta.animations` (richer than `frameTags` — explicit fps, arbitrary frame-name selection, per-frame events) without conflicting with the Aseprite shape. Tool-specific extensions (our `meta.app` / `meta.version` / `meta.sources` / `meta.normal`) ride along the same way. `meta` requires at least one of `sources` or `image`: our atlas tool emits `sources` (multiple encodings — png, webp, avif, ktx2 — each a format + URI), while raw TexturePacker/Aseprite exports carry the legacy single-file `meta.image` string. Readers prefer `sources` when present and fall back to `image`.
 */
export interface AtlasJson {
  $schema?: string
  meta: {
    [k: string]: unknown
  }
  frames: {
    [k: string]: Frame
  }
}
/**
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^.+$".
 */
export interface Frame {
  frame: Rect
  rotated: boolean
  trimmed: boolean
  spriteSourceSize: Rect
  sourceSize: Size
  pivot?: Vec2
  /**
   * Aseprite-style per-frame display time in milliseconds. Optional. Our atlas tool doesn't write this (we use a per-animation `fps` instead), but Aseprite-emitted files have it on every frame; the schema allows it through so Aseprite atlases validate as-is.
   */
  duration?: number
  mesh?: FrameMesh
  /**
   * TexturePacker polygon-trim output: source-image pixel coordinates (y-down), one entry per vertex. Normalized by the loader into frame-local UVs; ignored when `mesh` is present.
   */
  vertices?: Vec2Tuple[]
  /**
   * TexturePacker polygon-trim UV coordinates, paired index-for-index with `vertices`.
   */
  verticesUV?: Vec2Tuple[]
  /**
   * Triangle indices into `vertices`/`verticesUV`.
   */
  triangles?: [number, number, number][]
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface Size {
  w: number
  h: number
}
export interface Vec2 {
  x: number
  y: number
}
/**
 * three-flatland's own baked per-frame polygon mesh (locals in [-0.5, 0.5], frame-local UVs in [0, 1], pre-triangulated). Read priority mirrors `meta.animations` vs `meta.frameTags`: this beats `vertices`/`verticesUV`/`triangles` when both are present. See issue #81.
 */
export interface FrameMesh {
  /**
   * Interleaved [x, y, u, v] vertex tuples.
   */
  verts: [number, number, number, number][]
  /**
   * Triangle indices into `verts`.
   */
  indices: number[]
}
