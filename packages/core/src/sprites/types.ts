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
  /** Render layer (for Renderer2D) */
  layer?: number
  /** Z-index within layer */
  zIndex?: number
  /** Pixel-perfect rendering (snap to pixels) */
  pixelPerfect?: boolean
  /** Whether this sprite should be lit by Flatland's lighting system */
  lit?: boolean
  /** Whether this sprite casts shadows onto other lit sprites */
  castShadow?: boolean
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
