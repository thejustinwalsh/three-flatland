import type { RegistryEntryDelta, RegistryEntryKind, RegistryPayload } from '../debug-protocol'
import type { BufferCursor } from './bus-pool'
import { copyTypedTo } from './bus-pool'

/**
 * Registered CPU array. Holds a *reference* to a host-owned typed array
 * plus metadata. The host bumps `version` by calling `touch(name)` when
 * it mutates the buffer in place, or passes a new reference to
 * `register` (which increments version). The provider samples on flush
 * and only emits entries whose version has advanced since the last
 * emission.
 */
/**
 * After this many consecutive checkpoint attempts where an entry
 * degraded to metadata-only, stop waiting for a clean drain and emit
 * `checkpoint: true, partial: true` instead (see `DebugRegistry.drain`)
 * — otherwise a durably oversized entry (bigger than the pool tier by
 * itself; see `bus-pool.ts`) would starve the checkpoint forever. A
 * handful of retries rides out transient contention for the shared
 * pool cursor from other features (stats, etc.) sharing the same
 * flush's buffer; if the entry is durably oversized, no amount of
 * retrying would ever succeed, so settling on `partial` is the honest
 * steady state.
 */
const CHECKPOINT_PARTIAL_AFTER_ATTEMPTS = 3

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
  /** True once we've logged the "doesn't fit in pool buffer" warning. */
  warnedOversized?: boolean
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
   * Set by `resetDelta()`; cleared once a drain actually writes
   * something. The next *productive* drain after a reset is a full
   * resend of every entry — flagged `checkpoint: true` on the wire
   * (#29 Phase C) so a time-travel consumer can anchor reconstruction
   * on it. Held pending (not cleared) across unproductive drains (e.g.
   * nothing registered yet) so the flag isn't lost waiting for content.
   */
  private _checkpointPending = false
  /**
   * Consecutive drains where `_checkpointPending` was true but at
   * least one entry degraded to metadata-only. Resets to 0 whenever a
   * drain succeeds cleanly (no degradation) or a new checkpoint cycle
   * begins (`resetDelta()`). See `CHECKPOINT_PARTIAL_AFTER_ATTEMPTS`.
   */
  private _checkpointDegradedAttempts = 0

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
  drain(out: RegistryPayload, filter: Set<string> | null = null, into?: BufferCursor): boolean {
    let wrote = false
    let anyDegraded = false
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
      // What actually got shipped — starts equal to `target`, but a
      // pool-overflow degrades it to 'meta' below. Recording the SHIP
      // shape (not the intended one) here is what keeps a degraded
      // entry eligible for retry on the next drain — marking it
      // 'full' when only metadata went out would make the next
      // drain's `lastShape === target` check wrongly think it's done.
      let shippedShape: 'full' | 'meta' = target
      if (inFilter) {
        if (into !== undefined) {
          // Pool path. Guard against the entry not fitting in the
          // remaining cursor space — happens when something like
          // ForwardPlusLighting's `tileScores` outruns the large
          // tier. Fail-soft: ship metadata-only with a one-shot
          // warn so we notice without blowing up the whole flush.
          const need = e.sampleView.byteLength
          const have = into.buffer.byteLength - into.byteOffset
          if (need > have) {
            if (!e.warnedOversized) {
              console.warn(
                `[devtools] registry entry '${name}' (${need}B) exceeds remaining ` +
                `pool buffer space (${have}B). Shipping metadata only. ` +
                `Bump POOL.large.size in bus-pool.ts if you want this entry visible.`,
              )
              e.warnedOversized = true
            }
            shippedShape = 'meta'
            anyDegraded = true
          } else {
            base.sample = copyTypedTo(into, e.sampleView)
          }
        } else {
          base.sample = e.sampleView
        }
      }
      entries[name] = base
      e.lastEmittedVersion = e.version
      e.lastEmittedShape = shippedShape
      wrote = true
    }
    for (const name of this._removed) {
      entries[name] = null
      wrote = true
    }
    this._removed.clear()
    if (wrote) {
      out.entries = entries
      if (this._checkpointPending) {
        if (anyDegraded) {
          // A checkpoint drain isn't allowed to claim `checkpoint:
          // true` while it silently dropped a sample it was supposed
          // to carry — that would hand reconstruction a "complete"
          // anchor that's actually missing data. Keep pending and
          // retry, up to the bound below.
          this._checkpointDegradedAttempts++
          if (this._checkpointDegradedAttempts >= CHECKPOINT_PARTIAL_AFTER_ATTEMPTS) {
            out.checkpoint = true
            out.partial = true
            this._checkpointPending = false
            this._checkpointDegradedAttempts = 0
          } else {
            delete out.checkpoint
            delete out.partial
          }
        } else {
          out.checkpoint = true
          delete out.partial
          this._checkpointPending = false
          this._checkpointDegradedAttempts = 0
        }
      } else {
        delete out.checkpoint
        delete out.partial
      }
    } else {
      delete out.entries
      delete out.checkpoint
      delete out.partial
    }
    return wrote
  }

  /**
   * Force the next drain to re-emit everything, flagged as a
   * checkpoint. Used both when a new consumer subscribes (late-joiners
   * need a full baseline) and on the producer's periodic checkpoint
   * cadence (`REGISTRY_CHECKPOINT_MS`) — same mechanism either way.
   */
  resetDelta(): void {
    for (const e of this._entries.values()) {
      e.lastEmittedVersion = 0
      e.lastEmittedShape = 'none'
    }
    this._checkpointPending = true
    this._checkpointDegradedAttempts = 0
  }

  dispose(): void {
    this._entries.clear()
    this._removed.clear()
  }
}
