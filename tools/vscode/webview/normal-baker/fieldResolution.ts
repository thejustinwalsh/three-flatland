import {
  DEFAULT_BUMP,
  DEFAULT_ELEVATION,
  DEFAULT_PITCH,
  DEFAULT_STRENGTH,
  type NormalBump,
  type NormalDirection,
  type NormalRegion,
  type NormalSourceDescriptor,
} from '@three-flatland/normals'

// Per-region-vs-descriptor field resolution for DISPLAY only. Mirrors
// `resolveRegion()` in packages/normals/src/descriptor.ts (region field ??
// descriptor field ?? built-in default) field-by-field — used to show the
// EFFECTIVE value of a field a region may be inheriting.
//
// There is deliberately no inverse "normalize for write" direction here
// anymore. An earlier version of this module also stripped a region's
// explicit field when it happened to equal the descriptor's CURRENT
// default, on the theory that "redundant" values shouldn't be stored
// explicitly. That was wrong: it made an explicit choice the user made
// retroactively reinterpretable by a later, unrelated edit to the
// descriptor default. Concretely — a region explicitly set to
// `direction: 'south'` while the descriptor default was ALSO `'south'`
// got silently stored as "inherits the default" (field omitted); if the
// descriptor default was later changed to `'north'`, that region's
// direction would silently flip to `'north'` too, even though the user
// never touched it after their original explicit choice. Explicit means
// explicit — `RegionPropertiesPanel.tsx`'s `commit()` and
// `descriptorIO.ts`'s `stateToDescriptor()` now write back exactly what
// the store holds, no default-comparison stripping. A field only stays
// omitted (inherited) when the user never wrote to it in the first place
// (e.g. a freshly drawn region's bump/direction/pitch/strength/elevation).

export function resolveBump(region: NormalRegion, descriptor: NormalSourceDescriptor): NormalBump {
  return region.bump ?? descriptor.bump ?? DEFAULT_BUMP
}

export function resolveDirection(
  region: NormalRegion,
  descriptor: NormalSourceDescriptor
): NormalDirection {
  return region.direction ?? descriptor.direction ?? 'flat'
}

export function resolvePitch(region: NormalRegion, descriptor: NormalSourceDescriptor): number {
  return region.pitch ?? descriptor.pitch ?? DEFAULT_PITCH
}

export function resolveStrength(region: NormalRegion, descriptor: NormalSourceDescriptor): number {
  return region.strength ?? descriptor.strength ?? DEFAULT_STRENGTH
}

export function resolveElevation(region: NormalRegion, descriptor: NormalSourceDescriptor): number {
  return region.elevation ?? descriptor.elevation ?? DEFAULT_ELEVATION
}

/** The five region fields a descriptor default can supply when a region omits them. */
export type OverridableField = 'bump' | 'direction' | 'pitch' | 'strength' | 'elevation'

/** Whether `field` is explicitly set on this region (vs. inheriting the descriptor default). */
export function isFieldOverridden(region: NormalRegion, field: OverridableField): boolean {
  return region[field] !== undefined
}

/**
 * Deliberately clear an explicit field back to "inherited" — the one
 * legitimate way a field goes from explicit to omitted post-load. Not
 * automatic, not triggered by a value happening to equal the default
 * (see this module's top doc comment) — only a direct user action
 * (`RegionPropertiesPanel.tsx`'s per-field reset button) calls this.
 */
export function clearRegionField(region: NormalRegion, field: OverridableField): NormalRegion {
  const next = { ...region }
  delete next[field]
  return next
}
