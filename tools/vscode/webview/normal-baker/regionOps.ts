import type { NormalRegion } from '@three-flatland/normals'

/**
 * `NormalRegion` plus a client-only stable id for list/selection UI. The
 * id never round-trips into the descriptor — strip it (see `toRegion`)
 * before handing a region back to the bake engine or the save payload.
 */
export type EditableRegion = NormalRegion & { id: string }

export function toRegion(region: EditableRegion): NormalRegion {
  const { id: _id, ...rest } = region
  return rest
}

export function fromRegion(region: NormalRegion, id: string): EditableRegion {
  return { ...region, id }
}

/** Append (default) or insert a region at `index`. Pure — returns a new array. */
export function addRegion(
  regions: readonly EditableRegion[],
  region: EditableRegion,
  index?: number
): EditableRegion[] {
  if (index === undefined || index >= regions.length) return [...regions, region]
  const next = regions.slice()
  next.splice(Math.max(0, index), 0, region)
  return next
}

export function removeRegion(regions: readonly EditableRegion[], id: string): EditableRegion[] {
  return regions.filter((r) => r.id !== id)
}

export function removeRegions(
  regions: readonly EditableRegion[],
  ids: ReadonlySet<string>
): EditableRegion[] {
  return regions.filter((r) => !ids.has(r.id))
}

/**
 * Move the region at `fromIndex` so it sits just before the gap at
 * `toIndex` (post-removal indexing — same convention as the atlas
 * timeline's `handleReorderGroup`). Out-of-range `fromIndex` is a no-op.
 */
export function reorderRegion(
  regions: readonly EditableRegion[],
  fromIndex: number,
  toIndex: number
): EditableRegion[] {
  if (fromIndex < 0 || fromIndex >= regions.length) return [...regions]
  const next = regions.slice()
  const moved = next.splice(fromIndex, 1)[0]!
  const adjusted = toIndex > fromIndex ? toIndex - 1 : toIndex
  const clamped = Math.max(0, Math.min(next.length, adjusted))
  next.splice(clamped, 0, moved)
  return next
}

export function updateRegion(
  regions: readonly EditableRegion[],
  id: string,
  patch: Partial<NormalRegion>
): EditableRegion[] {
  return regions.map((r) => (r.id === id ? { ...r, ...patch } : r))
}

/**
 * Replace a region wholesale rather than shallow-merging a patch. Needed
 * whenever the new value must be able to OMIT a field the old region had
 * (`updateRegion`'s spread-merge can only add/overwrite keys, never
 * delete one) — e.g. after `normalizeRegion` strips a field that now
 * matches the descriptor default.
 */
export function replaceRegion(
  regions: readonly EditableRegion[],
  next: EditableRegion
): EditableRegion[] {
  return regions.map((r) => (r.id === next.id ? next : r))
}
