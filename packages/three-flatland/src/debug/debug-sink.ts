/**
 * Module-level "debug sink" — engine modules call these helpers to
 * expose CPU arrays to the devtools pane without linking directly to
 * `DevtoolsProvider`. When `DEVTOOLS_BUNDLED` is false (prod build
 * with no devtools flag), every function compiles down to a no-op
 * that terser strips — zero runtime cost in production.
 *
 * The sink holds a single active `DebugRegistry` reference (set by the
 * `DevtoolsProvider` constructor). If multiple providers are
 * constructed in the same page the newest wins; that's a pathological
 * case we deliberately don't support yet.
 */
import type { RegistryEntryKind } from '../debug-protocol'
import { DEVTOOLS_BUNDLED } from '../debug-protocol'
import type { DebugRegistry } from './DebugRegistry'

let _active: DebugRegistry | null = null

/** @internal Called by `DevtoolsProvider` — not for app code. */
export function _setActiveRegistry(registry: DebugRegistry | null): void {
  if (!DEVTOOLS_BUNDLED) return
  _active = registry
}

/**
 * Publish (or re-publish) a named CPU array to the devtools pane.
 * Holds a *reference*; the host keeps mutating its own buffer. Call
 * `touchDebugArray(name)` when you mutate in place so the provider
 * knows to re-send on the next batch. Replacing the buffer (new
 * `ref`) calls `touchDebugArray` implicitly.
 *
 * Safe to call any time — no-op when devtools isn't bundled.
 */
export function registerDebugArray(
  name: string,
  ref: Float32Array | Uint32Array | Int32Array,
  kind: RegistryEntryKind,
  opts?: { label?: string; length?: number },
): void {
  if (!DEVTOOLS_BUNDLED) return
  _active?.register(name, ref, kind, opts)
}

/**
 * Signal that a previously-registered array has been mutated in place
 * and should be re-sampled on the next batch flush.
 */
export function touchDebugArray(name: string, length?: number): void {
  if (!DEVTOOLS_BUNDLED) return
  _active?.touch(name, length)
}

/** Remove a named array. Consumers will see it disappear on the next batch. */
export function unregisterDebugArray(name: string): void {
  if (!DEVTOOLS_BUNDLED) return
  _active?.unregister(name)
}
