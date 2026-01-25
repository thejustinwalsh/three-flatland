import type { Sprite2D } from '../sprites/Sprite2D'
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
 * Layer configuration.
 */
export interface LayerConfig {
  /** Layer name */
  name: string
  /** Layer value/index */
  value: number
  /** Blend mode for this layer */
  blendMode?: BlendMode
  /** Sort mode for sprites in this layer */
  sortMode?: SortMode
  /** Whether this layer is visible */
  visible?: boolean
}

/**
 * Render statistics.
 */
export interface RenderStats {
  /** Total sprites in the renderer */
  spriteCount: number
  /** Number of batches created */
  batchCount: number
  /** Number of draw calls this frame */
  drawCalls: number
  /** Number of visible sprites rendered */
  visibleSprites: number
}

/**
 * Options for Renderer2D.
 */
export interface Renderer2DOptions {
  /** Maximum sprites per batch (default: 10000) */
  maxBatchSize?: number
  /** Enable automatic sorting (default: true) */
  autoSort?: boolean
  /** Enable frustum culling (default: true) */
  frustumCulling?: boolean
}

/**
 * Sorting function for custom sort mode.
 */
export type SpriteSortFunction = (a: Sprite2D, b: Sprite2D) => number

/**
 * Batch key for grouping sprites by material.
 */
export interface BatchKey {
  /** Material instance */
  material: Sprite2DMaterial
  /** Material batch ID for fast comparison */
  batchId: number
}

/**
 * Internal sprite entry for batch management.
 */
export interface SpriteEntry {
  /** The sprite instance */
  sprite: Sprite2D
  /** Computed sort key: (layer << 24) | (batchId << 12) | zIndex */
  sortKey: number
  /** Whether the sprite needs re-upload */
  dirty: boolean
}
