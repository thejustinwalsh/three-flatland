import { SlugShapeSet } from '@three-flatland/slug'
import type { RegisteredSVG } from '@three-flatland/slug'

let sharedShapeSet: SlugShapeSet | undefined

/**
 * Source-keyed cache of in-flight/loaded `Svg` registrations. Lives next to
 * the shared set (not `components/svg.ts`) so the two invalidate together —
 * `setSharedShapeSet` clears this whenever the set it populates changes.
 */
export const svgCache = new Map<string, Promise<RegisteredSVG>>()

/**
 * The `SlugShapeSet` every `Svg` component registers its paths into. All
 * `Svg` instances share ONE set (lazily created on first use) so
 * `ShapeGroupManager` — which groups draw calls by set identity — batches
 * every icon into a single `InstancedShapeMesh` instead of one per source.
 */
export function getSharedShapeSet(): SlugShapeSet {
  if (sharedShapeSet == null) {
    sharedShapeSet = new SlugShapeSet()
  }
  return sharedShapeSet
}

/**
 * Replaces the shared set — e.g. installing a baked icon atlas — and clears
 * the SVG cache so subsequent loads register into the new set. Does NOT
 * dispose the replaced set: `Svg` instances already mounted against it keep
 * rendering from it and their own draw group. Install before constructing
 * UI; this is not a live hot-swap for already-mounted components.
 */
export function setSharedShapeSet(set: SlugShapeSet): void {
  sharedShapeSet = set
  svgCache.clear()
}
