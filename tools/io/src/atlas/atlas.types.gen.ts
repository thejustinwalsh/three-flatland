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
  /**
   * Requires at least one of `sources` or `image` (see $defs/MetaBase). The `anyOf` sits alongside a `$ref` rather than inline on `MetaBase` itself — nesting a bare combinator next to `properties` collapses object-property codegen (json-schema-to-typescript) to an index signature, which would erase every typed `meta.*` field including `animations`.
   */
  meta: MetaBase & {
    [k: string]: unknown
  }
  frames: {
    [k: string]: Frame
  }
}
export interface MetaBase {
  app?: string
  version?: string
  size: Size
  scale?: string
  format?: string
  pivot?: Vec2
  normal?: string
  /**
   * Legacy single-file image name/path (TexturePacker/Aseprite default output). Fallback source on read when `sources` is absent — `sources` is preferred for new atlases since it names a format + URI per encoding.
   */
  image?: string
  /**
   * @minItems 1
   */
  sources?: SourceEntry[]
  /**
   * Our richer animation map — named, references frame keys (not indices), explicit fps, optional events. Aseprite's `frameTags` lives alongside under `meta.frameTags`; readers prefer `meta.animations` when present and fall back to converting `frameTags` + per-frame `duration`.
   */
  animations?: {
    [k: string]: Animation
  }
  /**
   * Aseprite-emitted animation tags: integer ranges into the frames array with a direction. Validated explicitly so Aseprite files round-trip and our reader can normalize them into `meta.animations`.
   */
  frameTags?: AsepriteFrameTag[]
  [k: string]: unknown
}
export interface Size {
  w: number
  h: number
}
export interface Vec2 {
  x: number
  y: number
}
export interface SourceEntry {
  format: 'png' | 'webp' | 'avif' | 'ktx2'
  uri: string
}
export interface Animation {
  /**
   * Unique frame names referenced by this animation. `frames` indexes into this array. Order is significant: `events` and `frames` both reference indices that depend on this ordering.
   *
   * @minItems 1
   */
  frameSet: string[]
  /**
   * Playback sequence as indices into `frameSet` — `frames[k]` is the k-th frame to display, looking up `frameSet[frames[k]]` for the frame name. Repeated indices encode hold counts (e.g. [0,0,1,2,2,2] = 2-frame hold of frameSet[0], then frameSet[1], then a 3-frame hold of frameSet[2]).
   *
   * @minItems 1
   */
  frames: number[]
  fps?: number
  loop?: boolean
  pingPong?: boolean
  /**
   * Per-frame event tags keyed by index INTO `frames` (not into `frameSet`). I.e. event '3' fires when the playhead reaches `frames[3]`.
   */
  events?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[0-9]+$".
     */
    [k: string]: string
  }
}
export interface AsepriteFrameTag {
  name: string
  from: number
  to: number
  direction?: 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse'
  color?: string
  repeat?: string
  data?: string
  [k: string]: unknown
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
