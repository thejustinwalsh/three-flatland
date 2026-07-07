import type { NormalSourceDescriptor } from '@three-flatland/normals'
import type { NormalBakerDefaults } from './normalBakerStore'
import { fromRegion, toRegion, type EditableRegion } from './regionOps'

/**
 * Split a loaded descriptor into store shape: regions get a client-only
 * id (`makeId`, injectable for deterministic tests — defaults to
 * `crypto.randomUUID()`), and every descriptor-level field except
 * `version`/`regions` becomes `defaults`. A missing/null descriptor
 * (no existing sidecar) yields an empty region list and empty defaults.
 */
export function descriptorToState(
  descriptor: NormalSourceDescriptor | null | undefined,
  makeId: () => string = () => crypto.randomUUID()
): { regions: EditableRegion[]; defaults: NormalBakerDefaults } {
  if (!descriptor) return { regions: [], defaults: {} }
  const { version: _version, regions, ...defaults } = descriptor
  return {
    regions: (regions ?? []).map((r) => fromRegion(r, makeId())),
    defaults,
  }
}

/**
 * Assemble store shape back into a descriptor for the save payload.
 * Regions are written through EXACTLY as the store holds them (minus the
 * client-only `id`) — no default-comparison stripping. A field the user
 * explicitly set stays explicit even if it currently equals the
 * descriptor default, so it survives a later edit to that default
 * unchanged (see `fieldResolution.ts`'s module doc). `version` is always
 * stamped `1`: it's a reserved schema-evolution marker (see
 * `descriptor.ts`), not a per-document value the user edits, so
 * canonicalizing it on save (even when the loaded descriptor omitted it)
 * is intentional, not a stray mutation.
 */
export function stateToDescriptor(
  regions: readonly EditableRegion[],
  defaults: NormalBakerDefaults
): NormalSourceDescriptor {
  return {
    version: 1,
    ...defaults,
    regions: regions.map((r) => toRegion(r)),
  }
}
