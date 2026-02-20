import { trait, relation } from 'koota'
import type { Object3D } from 'three'

// ============================================
// GPU instance data (SoA — maps to interleaved GPU buffers)
// ============================================

/** Sprite frame UV in atlas (x, y, width, height) normalized 0-1 */
export const SpriteUV = trait({ x: 0, y: 0, w: 1, h: 1 })

/** Sprite tint color and alpha (r, g, b, a) */
export const SpriteColor = trait({ r: 1, g: 1, b: 1, a: 1 })

/** Sprite flip flags: 1 = normal, -1 = flipped */
export const SpriteFlip = trait({ x: 1, y: 1 })

// ============================================
// Sort/batch metadata
// ============================================

/** Sort key components for batching: render layer and z-index within layer */
export const SpriteLayer = trait({ layer: 0, zIndex: 0 })

/** Material reference for batching (batchId from Sprite2DMaterial) */
export const SpriteMaterialRef = trait({ materialId: 0 })

// ============================================
// Tags
// ============================================

/** Tag: entity is renderable (has all required components for rendering) */
export const IsRenderable = trait()

/** Tag: entity is currently assigned to a SpriteBatch */
export const IsBatched = trait()

/** Tag: entity is rendering standalone (not in a batch) */
export const IsStandalone = trait()

// ============================================
// Reference traits (AoS — complex objects)
// ============================================

/** Reference back to the Three.js object (Sprite2D mesh) */
export const ThreeRef = trait(() => ({ object: null as Object3D | null }))

// ============================================
// Relations
// ============================================

/** Relation: sprite entity → batch entity (exclusive: sprite can only be in one batch) */
export const InBatch = relation({ exclusive: true })
