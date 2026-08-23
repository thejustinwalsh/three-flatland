import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'

/**
 * Blend mode for rendering layers.
 */
export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen'

/**
 * Sort mode for sprites within a layer.
 */
export type SortMode = 'none' | 'z-index' | 'y-sort' | 'custom'

/**
 * Instance attribute data types.
 */
export type InstanceAttributeType = 'float' | 'vec2' | 'vec3' | 'vec4'

/**
 * Configuration for a custom instance attribute.
 */
export interface InstanceAttributeConfig {
  /** Attribute name (used in TSL as instanceFloat('name')) */
  name: string
  /** Data type */
  type: InstanceAttributeType
  /** Default value */
  defaultValue: number | [number, number] | [number, number, number] | [number, number, number, number]
}

/**
 * SortLayerManager layer descriptor.
 */
export interface SortLayerDescriptor {
  /** Sort layer name */
  name: string
  /** Sort layer value (render order) */
  value: number
  /** Blend mode for this sort layer */
  blendMode?: BlendMode
  /** Sort mode for sprites in this sort layer */
  sortMode?: SortMode
  /** Whether this sort layer is visible */
  visible?: boolean
}

/**
 * Sprite-domain render statistics.
 *
 * Tracks counts the sprite pipeline owns: sprite instance count,
 * batch count, visible-after-culling count. Does NOT include
 * renderer-level stats (draw calls, triangles, GPU time) — those live
 * in the devtools producer (`@three-flatland/debug` subpath), which is
 * fully tree-shaken in prod builds and therefore doesn't pollute the
 * prod bundle with stats math. If you want renderer stats, subscribe
 * to the debug bus's `stats` feature.
 */
export interface RenderStats {
  /** Total sprites in the renderer */
  spriteCount: number
  /** Number of batches created */
  batchCount: number
  /** Number of visible sprites rendered */
  visibleSprites: number
}

/** A local-space clipping rectangle: [x, y, width, height]. */
export type ClipRect = readonly [x: number, y: number, width: number, height: number]

/**
 * Options for SpriteGroup.
 */
export interface SpriteGroupOptions {
  /**
   * Advisory sprite count used to reserve hot CPU-side storage during
   * construction. It does not cap enrollment or pre-create GPU batches.
   * React Three Fiber users pass a stable options object through `args`
   * (for example, one created with `useMemo`) and reconstruct the group to
   * change it; it is intentionally not a mutable JSX property.
   */
  expectedSprites?: number
  /**
   * Maximum sprites per batch. Must be a positive safe integer no greater
   * than the world's 20-bit entity capacity (1,048,576). Omit to use
   * 1024 → 4096 → 16384 capacity tiers; set a value to pin every batch.
   */
  maxBatchSize?: number
  /** Enable automatic sorting (default: true) */
  autoSort?: boolean
  /** Enable frustum culling (default: true) */
  frustumCulling?: boolean
  /** Automatically invalidate transforms every frame (default: true).
   *  Enable for games where sprites move frequently.
   *  Disable for static UIs and call invalidateTransforms() manually.
   *  Note: Property changes (tint, alpha, etc.) don't need this - they write directly to buffers. */
  autoInvalidateTransforms?: boolean
  /** Local-space clipping rectangle. WebGPU renderer only. */
  clipRect?: ClipRect | null
}

/**
 * Sorting function for custom sort mode.
 */
export type SpriteSortFunction = (
  a: { sortLayer: number; zIndex: number },
  b: { sortLayer: number; zIndex: number }
) => number

/**
 * Batch key for grouping sprites by material.
 */
export interface BatchKey {
  /** Material instance */
  material: Sprite2DMaterial
  /** Material batch ID for fast comparison */
  batchId: number
}
