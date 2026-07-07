import type { NormalSourceDescriptor } from '@three-flatland/normals'
import { normalizeRegion } from './fieldResolution'
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
 * Every region is normalized against `defaults` first (see
 * `normalizeRegion`) so a field that now coincides with a default —
 * whether because it always did, or because a default changed out from
 * under an explicit override — is written implicitly rather than
 * explicitly. `version` is always stamped `1`: it's a reserved
 * schema-evolution marker (see `descriptor.ts`), not a per-document
 * value the user edits, so canonicalizing it on save (even when the
 * loaded descriptor omitted it) is intentional, not a stray mutation.
 */
export function stateToDescriptor(
  regions: readonly EditableRegion[],
  defaults: NormalBakerDefaults
): NormalSourceDescriptor {
  return {
    version: 1,
    ...defaults,
    regions: regions.map((r) => normalizeRegion(toRegion(r), defaults)),
  }
}
