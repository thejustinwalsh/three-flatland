/**
 * Default render layers for 2D scenes.
 *
 * These provide semantic layer names for common 2D game scenarios.
 * You can use these directly or define custom layers.
 *
 * @example
 * ```typescript
 * import { Layers } from '@three-flatland/core'
 *
 * sprite.layer = Layers.ENTITIES
 * shadow.layer = Layers.SHADOWS
 * ```
 */
export const Layers = {
  /** Background elements (sky, distant scenery) */
  BACKGROUND: 0,
  /** Ground/floor tiles */
  GROUND: 1,
  /** Shadow sprites (render below entities) */
  SHADOWS: 2,
  /** Game entities (players, enemies, items) */
  ENTITIES: 3,
  /** Visual effects (particles, spell effects) */
  EFFECTS: 4,
  /** Foreground elements (overlays, weather) */
  FOREGROUND: 5,
  /** UI elements (always on top) */
  UI: 6,
} as const

/**
 * Layer name type.
 */
export type LayerName = keyof typeof Layers

/**
 * Layer value type.
 */
export type LayerValue = (typeof Layers)[LayerName]

/**
 * Type alias for any valid layer (built-in or custom).
 * Custom layers can use any number, built-in layers use 0-6.
 */
export type Layer = number

/**
 * Encode a sort key from layer, material ID, and zIndex.
 *
 * Format: (layer & 0xFF) << 24 | (batchId & 0xFFF) << 12 | (zIndex & 0xFFF)
 *
 * This allows efficient sorting with a single numeric comparison.
 *
 * @param layer - Layer value (0-255)
 * @param batchId - Material ID (0-4095)
 * @param zIndex - Z-index within layer (0-4095, or negative values mapped to positive range)
 * @returns Encoded sort key
 */
export function encodeSortKey(layer: number, batchId: number, zIndex: number): number {
  // Map zIndex from signed (-2048 to 2047) to unsigned (0 to 4095)
  const mappedZIndex = (zIndex + 2048) & 0xfff
  return ((layer & 0xff) << 24) | ((batchId & 0xfff) << 12) | mappedZIndex
}

/**
 * Decode a sort key back to its components.
 *
 * @param sortKey - Encoded sort key
 * @returns Object with layer, batchId, and zIndex
 */
export function decodeSortKey(sortKey: number): { layer: number; batchId: number; zIndex: number } {
  const layer = (sortKey >> 24) & 0xff
  const batchId = (sortKey >> 12) & 0xfff
  const mappedZIndex = sortKey & 0xfff
  // Map back from unsigned to signed
  const zIndex = mappedZIndex - 2048
  return { layer, batchId, zIndex }
}
