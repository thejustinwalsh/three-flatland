import type { SortLayerValue } from '../pipeline/sortLayers'
import type { Texture, Color, Vector2 } from 'three'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { AlphaMap } from '../events/AlphaMap'

/**
 * Represents a single frame in a spritesheet atlas.
 */
/**
 * Tight per-frame polygon mesh baked from the frame's alpha silhouette.
 *
 * Local positions live in the unit-quad space `[-0.5, 0.5]` (matching
 * the synthesized quad), UVs are frame-local `[0, 1]` (the shader
 * remaps them into the atlas via `instanceUV`, exactly like the
 * synth-quad corner UV). Consumed by the alpha-blend tight-mesh render
 * path; frames without a mesh fall back to the synth quad.
 */
export interface SpriteFrameMesh {
  /** Interleaved vertex data: [x, y, u, v] × vertexCount. */
  verts: Float32Array
  /** Triangle indices into `verts`. */
  indices: Uint16Array
  /** Number of vertices (verts.length / 4). */
  vertexCount: number
  /** Vertex offset into the sheet's concatenated `meshVerts` array. */
  vertexOffset: number
  /** Index offset into the sheet's concatenated `meshIndices` array. */
  indexOffset: number
}

export interface SpriteFrame {
  /** Frame name/identifier */
  name: string
  /** X position in atlas (normalized 0-1) */
  x: number
  /** Y position in atlas (normalized 0-1) */
  y: number
  /** Width in atlas (normalized 0-1) */
  width: number
  /** Height in atlas (normalized 0-1) */
  height: number
  /** Original frame width in pixels */
  sourceWidth: number
  /** Original frame height in pixels */
  sourceHeight: number
  /** Pivot point (0-1) */
  pivot?: { x: number; y: number }
  /** Is frame rotated 90deg in atlas? */
  rotated?: boolean
  /** Is frame trimmed? */
  trimmed?: boolean
  /** Trim offset if trimmed */
  trimOffset?: { x: number; y: number; width: number; height: number }
  /** Tight polygon mesh for the alpha-blend path; null/absent = synth quad. */
  mesh?: SpriteFrameMesh | null
}

/**
 * Options for creating a Sprite2D.
 */
export interface Sprite2DOptions {
  /** Texture to use (can be set later via texture property for R3F compatibility) */
  texture?: Texture
  /** Initial frame (optional, defaults to full texture) */
  frame?: SpriteFrame
  /** Anchor/pivot point (0-1), default [0.5, 0.5] (center) */
  anchor?: Vector2 | [number, number]
  /** Tint color, default white. Accepts Color, hex string, hex number, or [r, g, b] array (0-1) */
  tint?: Color | string | number | [number, number, number]
  /** Opacity 0-1, default 1 */
  alpha?: number
  /** Flip horizontally */
  flipX?: boolean
  /** Flip vertically */
  flipY?: boolean
  /** Sort layer — registered name or numeric order */
  sortLayer?: SortLayerValue
  /** Z-index within sortLayer */
  zIndex?: number
  /** Pixel-perfect rendering (snap to pixels) */
  pixelPerfect?: boolean
  /** Whether this sprite receives lighting from Flatland's LightEffect (default: true) */
  lit?: boolean
  /** Whether this sprite receives shadows from the SDF shadow pipeline (default: true) */
  receiveShadows?: boolean
  /** Whether this sprite contributes to the shadow-caster occlusion pre-pass (default: false — opt in) */
  castsShadow?: boolean
  /**
   * Per-sprite occluder radius in world units. Consumed by shadow-
   * casting LightEffects (e.g., the SDF sphere-tracer uses it as the
   * self-silhouette escape distance). When omitted (default), the
   * batch layer auto-resolves to `max(scale.x, scale.y)` each frame,
   * which tracks scale changes and animation frame size swaps. Set
   * explicitly to override — useful when the visible body is tighter
   * than the quad bounds.
   */
  shadowRadius?: number
  /** Custom material (sprites with same material instance batch together) */
  material?: Sprite2DMaterial
}

/**
 * Named animation as exposed at runtime by the SpriteSheet. Frame
 * names are post-duplication — repeating a name in `frames` encodes
 * a hold (e.g. ['idle_0', 'idle_0', 'idle_1'] = 2-frame hold then
 * 1-frame). This shape is the canonical runtime representation
 * regardless of source format (TP / Aseprite / our atlas tool).
 */
export interface SpriteAnimation {
  /** Frame names in playback order, with duplicates encoding hold counts. */
  frames: readonly string[]
  /** Frames per second. Default 12 when the source format leaves it unspecified. */
  fps: number
  /** Loop indefinitely? Default true. */
  loop: boolean
  /** Reverse direction at each end? Default false. */
  pingPong: boolean
  /** Optional per-frame-index event tags (frame index → tag name). */
  events?: Record<string, string>
}

/**
 * Spritesheet data structure.
 *
 * Animation-related fields are optional: a sheet built by
 * `SpriteSheetLoader` always populates them, but synthetic sheets
 * (test fixtures, hand-built mocks, runtime-generated sheets without
 * animation metadata) can omit them. Consumers should defensively
 * check `sheet.animations?.size` rather than assume presence.
 */
export interface SpriteSheet {
  /** The texture atlas */
  texture: Texture
  /** Map of frame name to frame data */
  frames: Map<string, SpriteFrame>
  /**
   * Named animations from the source JSON. Populated by
   * `SpriteSheetLoader` from `meta.animations` (our shape) or
   * normalized from `meta.frameTags` + per-frame `duration`
   * (Aseprite shape). Optional to keep synthetic sheets simple.
   */
  animations?: Map<string, SpriteAnimation>
  /** Atlas width in pixels */
  width: number
  /** Atlas height in pixels */
  height: number
  /**
   * Tangent-space normal map, 1:1 co-registered with `texture`.
   *
   * Populated when the loader is given `normals: true` (or a
   * descriptor). Binds to `NormalMapProvider.normalMap` on a lit
   * sprite.
   */
  normalMap?: Texture
  /**
   * CPU alpha hitmask, co-registered with `texture`. Populated when
   * the loader is given `alpha: true`. Consumed by
   * `hitTestMode: 'alpha'` (assign to `sprite.alphaMap`). Spec §8.4.
   */
  alphaMap?: AlphaMap
  /**
   * Concatenated per-frame mesh vertex data ([x,y,u,v] interleaved)
   * across all frames that carry a mesh. Frame offsets live on
   * `frame.mesh.vertexOffset` / `indexOffset`. Undefined when no frame
   * has mesh data.
   */
  meshVerts?: Float32Array
  /** Concatenated per-frame mesh indices (see `meshVerts`). */
  meshIndices?: Uint16Array
  /** Get a frame by name */
  getFrame(name: string): SpriteFrame
  /** Get all frame names */
  getFrameNames(): string[]
  /** Get an animation by name. Returns undefined if not present. */
  getAnimation?(name: string): SpriteAnimation | undefined
  /** Get all animation names. */
  getAnimationNames?(): string[]
}

/**
 * Aseprite frame tag — a named integer range into the frames array
 * with a playback direction. Validates against the corresponding
 * `$defs/AsepriteFrameTag` in the atlas schema.
 */
export interface AsepriteFrameTag {
  name: string
  from: number
  to: number
  direction?: 'forward' | 'reverse' | 'pingpong' | 'pingpong_reverse'
  color?: string
  repeat?: string
  data?: string
}

/**
 * Our richer per-animation shape, stored under `meta.animations`.
 * Read priority: this beats `meta.frameTags` when both are present.
 *
 * Wire format is indexed for compactness: `frameSet` lists each
 * unique frame name once; `frames` is the playback sequence as
 * integer indices into `frameSet`. The `SpriteSheetLoader`
 * dereferences this into the flat name-based `SpriteAnimation` at
 * load time, so runtime API consumers never see the indexed shape.
 */
export interface AtlasAnimation {
  frameSet: string[]
  frames: number[]
  fps?: number
  loop?: boolean
  pingPong?: boolean
  events?: Record<string, string>
}

/**
 * JSON Hash format. TexturePacker is the base shape; Aseprite extends
 * it with `meta.frameTags` + per-frame `duration`; we extend it with
 * `meta.animations` (richer than `frameTags`). All three live under
 * `meta` so the root keys stay TP-compatible.
 */
/**
 * Optional per-frame polygon payloads the loader understands:
 * - `mesh` — three-flatland's own format: locals in [-0.5, 0.5],
 *   frame-local UVs in [0, 1], pre-triangulated
 * - `vertices`/`triangles` — TexturePacker polygon-trim output
 *   (source-image pixel coords, y-down), normalized by the loader
 */
export interface SpriteSheetFrameMeshJSON {
  mesh?: {
    verts: [number, number, number, number][]
    indices: number[]
  }
  vertices?: [number, number][]
  verticesUV?: [number, number][]
  triangles?: [number, number, number][]
}

export interface SpriteSheetJSONHash {
  frames: {
    [name: string]: {
      frame: { x: number; y: number; w: number; h: number }
      rotated: boolean
      trimmed: boolean
      spriteSourceSize: { x: number; y: number; w: number; h: number }
      sourceSize: { w: number; h: number }
      pivot?: { x: number; y: number }
      /** Aseprite-emitted per-frame display time (ms). */
      duration?: number
    } & SpriteSheetFrameMeshJSON
  }
  meta: {
    /** Multi-encoding source list (atlas-tool output) — preferred on read. */
    sources?: { format: 'png' | 'webp' | 'avif' | 'ktx2'; uri: string }[]
    /** Legacy single-image filename (TexturePacker/Aseprite) — fallback when `sources` is absent. */
    image?: string
    size: { w: number; h: number }
    scale: string
    /** Our richer animation map — preferred source on read. */
    animations?: Record<string, AtlasAnimation>
    /** Aseprite-emitted animation tags — fallback source on read. */
    frameTags?: readonly AsepriteFrameTag[]
    [k: string]: unknown
  }
}

/**
 * JSON Array format.
 */
export interface SpriteSheetJSONArray {
  frames: Array<
    {
      filename: string
      frame: { x: number; y: number; w: number; h: number }
      rotated: boolean
      trimmed: boolean
      spriteSourceSize: { x: number; y: number; w: number; h: number }
      sourceSize: { w: number; h: number }
      pivot?: { x: number; y: number }
      /** Aseprite-emitted per-frame display time (ms). */
      duration?: number
    } & SpriteSheetFrameMeshJSON
  >
  meta: {
    /** Multi-encoding source list (atlas-tool output) — preferred on read. */
    sources?: { format: 'png' | 'webp' | 'avif' | 'ktx2'; uri: string }[]
    /** Legacy single-image filename (TexturePacker/Aseprite) — fallback when `sources` is absent. */
    image?: string
    size: { w: number; h: number }
    scale: string
    animations?: Record<string, AtlasAnimation>
    frameTags?: readonly AsepriteFrameTag[]
    [k: string]: unknown
  }
}
