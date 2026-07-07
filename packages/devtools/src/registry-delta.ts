/**
 * Shared registry-delta fold logic (#29 Phase C review fix).
 *
 * Both the live client (`devtools-client.ts`'s `_applyRegistry`,
 * streaming deltas in arrival order) and the time-travel reconstruction
 * core (`dashboard/registry-reconstruction.ts`, replaying a checkpoint
 * plus its following deltas) fold ONE `RegistryPayload` into an
 * accumulated `Map<string, RegistryEntrySnapshot>` the same way. These
 * used to be two independently-maintained copies of the same rule —
 * an adversarial review caught that the reconstruction copy didn't
 * necessarily agree with the live one. One shared function means they
 * can't diverge again by construction, not just by a parity test.
 */
import type { RegistryPayload } from 'three-flatland/debug-protocol'
import type { RegistryEntrySnapshot } from './devtools-client.js'

/** Shared zero-length placeholder for entries whose checkpoint/delta never carried a sample. */
export const EMPTY_REGISTRY_SAMPLE: Float32Array = new Float32Array(0)

/**
 * Fold one non-null `RegistryPayload` into an accumulating snapshot
 * map, in place. Delta rules: `entries[name] === null` removes the
 * entry; a present delta overwrites it, falling back to the
 * previously known sample when THIS delta didn't carry one — outside
 * the consumer's selection filter, or degraded to metadata-only by a
 * pool overflow on the producer side (see `DebugRegistry.drain`).
 */
export function applyRegistryEntryDelta(
  entries: Map<string, RegistryEntrySnapshot>,
  payload: RegistryPayload,
): void {
  if (payload.entries === undefined) return
  for (const name in payload.entries) {
    const d = payload.entries[name]
    if (d === undefined) continue
    if (d === null) {
      entries.delete(name)
      continue
    }
    const prev = entries.get(name)
    const sample = d.sample ?? prev?.sample ?? EMPTY_REGISTRY_SAMPLE
    if (prev === undefined) {
      entries.set(name, { name, kind: d.kind, version: d.version, count: d.count, sample, label: d.label })
    } else {
      prev.kind = d.kind
      prev.version = d.version
      prev.count = d.count
      prev.sample = sample
      prev.label = d.label
    }
  }
}
