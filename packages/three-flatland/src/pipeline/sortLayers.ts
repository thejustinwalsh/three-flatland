/**
 * Named, typed sort layers — the opinionated façade over three.js's
 * `renderOrder` for batching-aware draw ordering.
 *
 * A sortLayer is one of three orthogonal ordering concerns:
 *
 *   - `sprite.sortLayer` — inter-batch order (which batch draws first)
 *   - `sprite.zIndex`    — intra-batch order (instance order within a batch)
 *   - `sprite.layers`    — three's camera-visibility bitmask (NOT a sort key)
 *
 * The name deliberately avoids colliding with three's `Object3D.layers`
 * (plural, bitmask) — same reason Unity 2D calls theirs `SortingLayer`.
 *
 * @example
 * ```typescript
 * import { SortLayers } from 'three-flatland'
 *
 * sprite.sortLayer = SortLayers.ENTITIES  // numeric
 * sprite.sortLayer = 'entities'           // named, type-checked
 * ```
 */

/** Configuration carried by a declared sort layer. */
export interface SortLayerConfig {
  /** Numeric order compiled down to three's `renderOrder` on batches. */
  renderOrder: number
}

/** Marker type for the sort layers the library ships out of the box. */
export type BuiltInSortLayer = SortLayerConfig

/**
 * Typed registry of sort-layer names (TanStack-style augmentation).
 *
 * User code extends this interface to get typed `sprite.sortLayer`
 * assignment and JSX props:
 *
 * ```typescript
 * declare module 'three-flatland' {
 *   interface SortLayerRegistry {
 *     radarBlip: SortLayerConfig
 *   }
 * }
 * flatland.declareSortLayer('radarBlip', { renderOrder: 42 })
 * sprite.sortLayer = 'radarBlip'  // ✓ typed
 * sprite.sortLayer = 'radarBlop'  // ✗ TS error
 * ```
 */
export interface SortLayerRegistry {
  /** Sprites that never declare a sortLayer land here (renderOrder 0). */
  default: BuiltInSortLayer
  /** Background elements (sky, distant scenery) */
  background: BuiltInSortLayer
  /** Ground/floor tiles */
  ground: BuiltInSortLayer
  /** Shadow sprites (render below entities) */
  shadows: BuiltInSortLayer
  /** Game entities (players, enemies, items) */
  entities: BuiltInSortLayer
  /** Visual effects (particles, spell effects) */
  effects: BuiltInSortLayer
  /** Foreground elements (overlays, weather) */
  foreground: BuiltInSortLayer
  /** UI elements (always on top) */
  ui: BuiltInSortLayer
}

/** A registered sort-layer name (augmentable via `SortLayerRegistry`). */
export type SortLayerName = Extract<keyof SortLayerRegistry, string>

/**
 * Anything assignable to `sprite.sortLayer`: a registered name (typed,
 * autocompleted) or a raw numeric order (escape hatch for dynamic
 * layering schemes).
 */
export type SortLayerValue = SortLayerName | (number & {})

/**
 * Default numeric sort layers for 2D scenes.
 *
 * These provide semantic values for common 2D game scenarios. Each maps
 * 1:1 to a named entry in {@link SortLayerRegistry} (`SortLayers.ENTITIES`
 * === `'entities'`'s renderOrder).
 */
export const SortLayers = {
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
 * Module-level table of declared sort layers. Seeded with the built-ins;
 * `declareSortLayer` adds user layers. Names are global by design — a
 * sortLayer name means the same order everywhere, matching how examples
 * and SortLayerGroup resolve names without a Flatland instance in scope.
 */
const declaredSortLayers = new Map<string, SortLayerConfig>([
  ['default', { renderOrder: 0 }],
  ['background', { renderOrder: SortLayers.BACKGROUND }],
  ['ground', { renderOrder: SortLayers.GROUND }],
  ['shadows', { renderOrder: SortLayers.SHADOWS }],
  ['entities', { renderOrder: SortLayers.ENTITIES }],
  ['effects', { renderOrder: SortLayers.EFFECTS }],
  ['foreground', { renderOrder: SortLayers.FOREGROUND }],
  ['ui', { renderOrder: SortLayers.UI }],
])

/**
 * Declare (or redeclare) a named sort layer.
 *
 * Pair with a `SortLayerRegistry` interface augmentation for typed use.
 */
export function declareSortLayer(name: SortLayerName, config: SortLayerConfig): SortLayerConfig {
  declaredSortLayers.set(name, { ...config })
  return declaredSortLayers.get(name)!
}

/** Look up a declared sort layer's config. */
export function getSortLayer(name: SortLayerName): SortLayerConfig | undefined {
  return declaredSortLayers.get(name)
}

/**
 * Resolve a sortLayer value (name or number) to its numeric order.
 *
 * Unknown names resolve to `'default'` (0) with a dev warning — a typo'd
 * name is already a TS error, so this only fires for untyped callers.
 */
export function resolveSortLayer(value: SortLayerValue): number {
  if (typeof value === 'number') return value
  const config = declaredSortLayers.get(value)
  if (config) return config.renderOrder
  console.warn(
    `three-flatland: unknown sortLayer '${value}' — declare it with declareSortLayer() first. Falling back to 'default' (0).`
  )
  return 0
}

/**
 * Encode a sort key from sortLayer, material ID, and zIndex.
 *
 * Format: (sortLayer & 0xFF) << 24 | (batchId & 0xFFF) << 12 | (zIndex & 0xFFF)
 *
 * This allows efficient sorting with a single numeric comparison.
 *
 * @param sortLayer - Sort layer value (0-255)
 * @param batchId - Material ID (0-4095)
 * @param zIndex - Z-index within layer (0-4095, or negative values mapped to positive range)
 * @returns Encoded sort key
 */
export function encodeSortKey(sortLayer: number, batchId: number, zIndex: number): number {
  // Map zIndex from signed (-2048 to 2047) to unsigned (0 to 4095)
  const mappedZIndex = (zIndex + 2048) & 0xfff
  return ((sortLayer & 0xff) << 24) | ((batchId & 0xfff) << 12) | mappedZIndex
}

/**
 * Decode a sort key back to its components.
 *
 * @param sortKey - Encoded sort key
 * @returns Object with sortLayer, batchId, and zIndex
 */
export function decodeSortKey(sortKey: number): {
  sortLayer: number
  batchId: number
  zIndex: number
} {
  const sortLayer = (sortKey >> 24) & 0xff
  const batchId = (sortKey >> 12) & 0xfff
  const mappedZIndex = sortKey & 0xfff
  // Map back from unsigned to signed
  const zIndex = mappedZIndex - 2048
  return { sortLayer, batchId, zIndex }
}
