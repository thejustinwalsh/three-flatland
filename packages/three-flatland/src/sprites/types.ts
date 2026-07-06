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
 * Spritesheet data structure.
 */
export interface SpriteSheet {
  /** The texture atlas */
  texture: Texture
  /** Map of frame name to frame data */
  frames: Map<string, SpriteFrame>
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
}

/**
 * JSON Hash format (TexturePacker default).
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
    } & SpriteSheetFrameMeshJSON
  }
  meta: {
    image: string
    size: { w: number; h: number }
    scale: string
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
    } & SpriteSheetFrameMeshJSON
  >
  meta: {
    image: string
    size: { w: number; h: number }
    scale: string
  }
}
