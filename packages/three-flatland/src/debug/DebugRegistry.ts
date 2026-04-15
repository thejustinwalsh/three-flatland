import type { RegistryEntryDelta, RegistryEntryKind, RegistryPayload } from '../debug-protocol'

/**
 * Registered CPU array. Holds a *reference* to a host-owned typed array
 * plus metadata. The host bumps `version` by calling `touch(name)` when
 * it mutates the buffer in place, or passes a new reference to
 * `register` (which increments version). The provider samples on flush
 * and only emits entries whose version has advanced since the last
 * emission.
 */
interface RegistryEntry {
  kind: RegistryEntryKind
  ref: Float32Array | Uint32Array | Int32Array
  version: number
  label?: string
  /** Version number last emitted on the bus — for delta skip. */
  lastEmittedVersion: number
  /**
   * Shape last emitted — `'full'` (with sample) vs `'meta'` (metadata
   * only). Tracked separately from `lastEmittedVersion` so a filter
   * flip from meta→full immediately re-emits even though the version
   * may not have changed.
   */
  lastEmittedShape: 'full' | 'meta' | 'none'
  /** Cached subarray view reused across flushes to avoid allocations. */
  sampleView: Float32Array | Uint32Array | Int32Array
  /** Snapshot length (sampleView is `ref.subarray(0, length)`). */
  length: number
}

/**
 * Provider-side store for host-owned CPU arrays. Call `register` from
 * engine code once a buffer exists; call `touch` (or re-`register`)
 * whenever it changes. `unregister` drops it and queues a `null` delta
 * so subscribers clear their view.
 *
 * The store is attached to a `DevtoolsProvider`; consumers subscribe
 * with the `'registry'` feature and receive deltas on each batch flush.
 */
export class DebugRegistry {
  private _entries = new Map<string, RegistryEntry>()
  /** Names removed since the last drain — emitted as `null` deltas. */
  private _removed = new Set<string>()

  /**
   * Register (or replace) a named buffer. Re-calling with the same name
   * but a new `ref` swaps the reference and bumps `version`; callers
   * that mutate in place should use `touch(name)` instead.
   */
  register(
    name: string,
    ref: RegistryEntry['ref'],
    kind: RegistryEntryKind,
    opts: { label?: string; length?: number } = {},
  ): void {
    const length = opts.length ?? ref.length
    const existing = this._entries.get(name)
    const version = (existing?.version ?? 0) + 1
    this._entries.set(name, {
      kind,
      ref,
      version,
      label: opts.label,
      lastEmittedVersion: existing?.lastEmittedVersion ?? 0,
      lastEmittedShape: existing?.lastEmittedShape ?? 'none',
      sampleView: ref.subarray(0, length),
      length,
    })
    this._removed.delete(name)
  }

  /**
   * Mark an in-place mutation. Cheaper than `register` because it keeps
   * the existing reference — just bumps the version so the next flush
   * ships a fresh sample.
   */
  touch(name: string, length?: number): void {
    const e = this._entries.get(name)
    if (!e) return
    e.version++
    if (length !== undefined && length !== e.length) {
      e.length = length
      e.sampleView = e.ref.subarray(0, length)
    }
  }

  unregister(name: string): void {
    if (this._entries.delete(name)) this._removed.add(name)
  }

  /** True if any entry has a new version or a pending removal. */
  hasPending(): boolean {
    if (this._removed.size > 0) return true
    for (const e of this._entries.values()) {
      if (e.version !== e.lastEmittedVersion) return true
    }
    return false
  }

  /**
   * Fill `out.entries` with a delta. `filter`:
   *   - `null`      → every entry ships with its sample.
   *   - `Set<name>` → entries in the filter ship with samples; others
   *                   ship **metadata only** (no sample) so the UI still
   *                   knows the entry exists and can offer to stream it.
   *   - empty set   → every entry ships metadata only.
   *
   * Only emits an entry when its `version` has advanced since the last
   * time we shipped *that shape* — samples and meta-only track separate
   * "last emitted" versions, so flipping the filter doesn't strand
   * the consumer on a stale meta-only snapshot.
   *
   * Returns `true` if anything was written.
   */
  drain(out: RegistryPayload, filter: Set<string> | null = null): boolean {
    let wrote = false
    const entries: Record<string, RegistryEntryDelta | null> = {}
    for (const [name, e] of this._entries) {
      const inFilter = filter === null || filter.has(name)
      const target = inFilter ? 'full' : 'meta'
      const lastShape = e.lastEmittedShape
      if (e.version === e.lastEmittedVersion && lastShape === target) continue

      const base: RegistryEntryDelta = {
        kind: e.kind,
        version: e.version,
        count: e.length,
        ...(e.label !== undefined ? { label: e.label } : {}),
      }
      if (inFilter) base.sample = e.sampleView
      entries[name] = base
      e.lastEmittedVersion = e.version
      e.lastEmittedShape = target
      wrote = true
    }
    for (const name of this._removed) {
      entries[name] = null
      wrote = true
    }
    this._removed.clear()
    if (wrote) out.entries = entries
    else delete out.entries
    return wrote
  }

  /** Force the next drain to re-emit everything. Used when a new consumer subscribes. */
  resetDelta(): void {
    for (const e of this._entries.values()) {
      e.lastEmittedVersion = 0
      e.lastEmittedShape = 'none'
    }
  }

  dispose(): void {
    this._entries.clear()
    this._removed.clear()
  }
}
