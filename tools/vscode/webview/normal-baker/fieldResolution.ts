import {
  DEFAULT_BUMP,
  DEFAULT_ELEVATION,
  DEFAULT_PITCH,
  DEFAULT_STRENGTH,
  directionToAngle,
  type NormalBump,
  type NormalDirection,
  type NormalRegion,
  type NormalSourceDescriptor,
} from '@three-flatland/normals'

// Per-region-vs-descriptor field resolution. Mirrors `resolveRegion()` in
// packages/normals/src/descriptor.ts (region field ?? descriptor field ??
// built-in default) field-by-field, plus the inverse: deciding whether an
// edited value should be written explicitly onto the region or omitted so
// it keeps inheriting the descriptor default. Keeping the two directions
// (resolve for display, normalize for write) in the same module keeps
// them from drifting out of sync with each other.

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

function numEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9
}

function directionsEqual(a: NormalDirection, b: NormalDirection): boolean {
  const aa = directionToAngle(a)
  const ba = directionToAngle(b)
  if (aa === null || ba === null) return aa === ba
  return numEqual(aa, ba)
}

/**
 * Strip explicit region fields that match the descriptor's current
 * resolved default — keeps a region's explicit fields limited to genuine
 * divergence from the descriptor, matching `resolveRegion()`'s
 * inherit-when-omitted semantics. Direction compares by resolved angle
 * (an explicit `'up'` against a `'north'` default is still redundant);
 * numbers compare with an epsilon so float settling doesn't leave a
 * spurious override. Returns a new object; the input is never mutated.
 */
export function normalizeRegion(
  region: NormalRegion,
  descriptor: NormalSourceDescriptor
): NormalRegion {
  const next: NormalRegion = { ...region }
  if (next.bump !== undefined && next.bump === (descriptor.bump ?? DEFAULT_BUMP)) {
    delete next.bump
  }
  if (
    next.direction !== undefined &&
    directionsEqual(next.direction, descriptor.direction ?? 'flat')
  ) {
    delete next.direction
  }
  if (next.pitch !== undefined && numEqual(next.pitch, descriptor.pitch ?? DEFAULT_PITCH)) {
    delete next.pitch
  }
  if (
    next.strength !== undefined &&
    numEqual(next.strength, descriptor.strength ?? DEFAULT_STRENGTH)
  ) {
    delete next.strength
  }
  if (
    next.elevation !== undefined &&
    numEqual(next.elevation, descriptor.elevation ?? DEFAULT_ELEVATION)
  ) {
    delete next.elevation
  }
  return next
}
