import type { Texture, Color, Vector2 } from 'three'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'

/**
 * Represents a single frame in a spritesheet atlas.
 */
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
  /** Render layer (for SpriteGroup) */
  layer?: number
  /** Z-index within layer */
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
  /** Get a frame by name */
  getFrame(name: string): SpriteFrame
  /** Get all frame names */
  getFrameNames(): string[]
}

/**
 * JSON Hash format (TexturePacker default).
 */
export interface SpriteSheetJSONHash {
  frames: {
    [name: string]: {
      frame: { x: number; y: number; w: number; h: number }
      rotated: boolean
      trimmed: boolean
      spriteSourceSize: { x: number; y: number; w: number; h: number }
      sourceSize: { w: number; h: number }
      pivot?: { x: number; y: number }
    }
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
  frames: Array<{
    filename: string
    frame: { x: number; y: number; w: number; h: number }
    rotated: boolean
    trimmed: boolean
    spriteSourceSize: { x: number; y: number; w: number; h: number }
    sourceSize: { w: number; h: number }
    pivot?: { x: number; y: number }
  }>
  meta: {
    image: string
    size: { w: number; h: number }
    scale: string
  }
}
