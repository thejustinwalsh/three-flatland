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
    }
  }
  meta: {
    sources: { format: 'png' | 'webp' | 'avif' | 'ktx2'; uri: string }[]
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
  frames: Array<{
    filename: string
    frame: { x: number; y: number; w: number; h: number }
    rotated: boolean
    trimmed: boolean
    spriteSourceSize: { x: number; y: number; w: number; h: number }
    sourceSize: { w: number; h: number }
    pivot?: { x: number; y: number }
    duration?: number
  }>
  meta: {
    sources: { format: 'png' | 'webp' | 'avif' | 'ktx2'; uri: string }[]
    size: { w: number; h: number }
    scale: string
    animations?: Record<string, AtlasAnimation>
    frameTags?: readonly AsepriteFrameTag[]
    [k: string]: unknown
  }
}
