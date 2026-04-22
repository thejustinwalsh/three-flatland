import type { BufferSubscriptionEntry, DebugFeature } from '../debug-protocol'
import { ACK_GRACE_MS } from '../debug-protocol'

/**
 * Resolved buffer subscription the producer can drain against. Keyed by
 * entry name; the value is the (mode, thumbSize) pair the consumers
 * collectively asked for after union.
 */
export type BuffersSubscription = Map<string, BufferSubscriptionEntry>

/** Per-consumer state tracked by the server. */
interface ConsumerState {
  features: Set<DebugFeature>
  lastAckAt: number
  /**
   * Registry entry selection. `null` = no filter (ship all entries);
   * `Set<name>` = ship only these. Union across consumers is what the
   * provider actually drains — any `null` wins.
   */
  registry: Set<string> | null
  /**
   * Buffer subscription. Map of entry-name → mode/config. Empty map =
   * no entries subscribed (the feature is on but nothing's being
   * watched). Absent entries get metadata-only in the drain.
   */
  buffers: Map<string, BufferSubscriptionEntry>
}

/**
 * Server-side registry of active consumers and the feature subsets they
 * care about.
 *
 * Replaces the earlier `Heartbeat` (producer-driven ping/pong) with an
 * ack-driven model:
 *
 *   1. Consumer sends `subscribe { id, features }`; server calls
 *      `onSubscribe(id, features)` → inserts/updates consumer state,
 *      sets `lastAckAt = now` (so the consumer survives the first
 *      grace window without having to have acked yet).
 *   2. Each `ack { id }` from a consumer refreshes `lastAckAt`.
 *   3. Each render tick (or any producer work-cycle), the server calls
 *      `pruneStale()`; consumers whose `lastAckAt` is older than
 *      `ACK_GRACE_MS` are removed.
 *   4. Producers ask `isActive(feature)` to decide whether to produce;
 *      active iff any remaining consumer's feature set contains it.
 *
 * Self-healing: re-subscribe with the same id is how a stalled
 * consumer recovers — the subscribe path IS the reconnect path.
 */
export class SubscriberRegistry {
  private _consumers = new Map<string, ConsumerState>()

  /**
   * Cached union-of-features across all consumers. Invalidated
   * (set to `null`) whenever any consumer's feature set changes or a
   * consumer is added/removed. Lazy-rebuilt by `isActive()` / `active()`.
   */
  private _activeCache: Set<DebugFeature> | null = null

  /**
   * Cached union of registry filters. `undefined` = not yet computed;
   * `null` = at least one consumer wants everything; `Set<name>` = the
   * narrow union (only these names are drained).
   */
  private _registrySelectionCache: Set<string> | null | undefined = undefined
  private _buffersSelectionCache: BuffersSubscription | undefined = undefined

  /**
   * Insert or update a consumer's subscription. Same id + different
   * features = feature-set modification. Same id + same features = no-op
   * (still refreshes `lastAckAt` — counts as implicit ack).
   */
  onSubscribe(
    id: string,
    features: readonly DebugFeature[],
    registry?: readonly string[],
    buffers?: Record<string, BufferSubscriptionEntry>,
  ): void {
    const now = Date.now()
    const regSel = registry === undefined ? null : new Set(registry)
    const bufMap = new Map<string, BufferSubscriptionEntry>()
    if (buffers !== undefined) {
      for (const [name, entry] of Object.entries(buffers)) {
        bufMap.set(name, entry)
      }
    }
    const existing = this._consumers.get(id)
    if (existing) {
      existing.features = new Set(features)
      existing.registry = regSel
      existing.buffers = bufMap
      existing.lastAckAt = now
    } else {
      this._consumers.set(id, {
        features: new Set(features),
        registry: regSel,
        buffers: bufMap,
        lastAckAt: now,
      })
    }
    this._activeCache = null
    this._registrySelectionCache = undefined
    this._buffersSelectionCache = undefined
  }

  /** Refresh a consumer's `lastAckAt`. No-op for unknown ids. */
  onAck(id: string): void {
    const c = this._consumers.get(id)
    if (c) c.lastAckAt = Date.now()
  }

  /** Remove a consumer explicitly. */
  onUnsubscribe(id: string): void {
    if (this._consumers.delete(id)) {
      this._activeCache = null
      this._registrySelectionCache = undefined
      this._buffersSelectionCache = undefined
    }
  }

  /**
   * Drop consumers whose `lastAckAt` is older than `ACK_GRACE_MS`.
   * Safe to call every tick — cheap when nothing's stale.
   */
  pruneStale(): void {
    const threshold = Date.now() - ACK_GRACE_MS
    let pruned = false
    for (const [id, c] of this._consumers) {
      if (c.lastAckAt < threshold) {
        this._consumers.delete(id)
        pruned = true
      }
    }
    if (pruned) {
      this._activeCache = null
      this._registrySelectionCache = undefined
      this._buffersSelectionCache = undefined
    }
  }

  /**
   * Union of every consumer's registry selection.
   *   - `null` → at least one consumer wants every entry (no-filter drain).
   *   - `Set<name>` → only these names are needed; provider drains only them.
   *   - empty set → no consumer wants any entries; provider skips drain.
   */
  registrySelection(): Set<string> | null {
    if (this._registrySelectionCache !== undefined) return this._registrySelectionCache
    const union = new Set<string>()
    for (const c of this._consumers.values()) {
      if (!c.features.has('registry')) continue
      if (c.registry === null) {
        this._registrySelectionCache = null
        return null
      }
      for (const name of c.registry) union.add(name)
    }
    this._registrySelectionCache = union
    return union
  }

  /**
   * Union of every consumer's buffer subscription map.
   *   - Entry present with `mode: 'stream'` in ANY consumer → stream wins.
   *   - Else if any consumer asks for `mode: 'thumbnail'` → thumbnail,
   *     using the MAX `thumbSize` requested by any consumer.
   *   - Entry absent from all consumers → not in the union (metadata-only).
   *
   * An empty map means no consumer is watching any entry: the producer
   * can skip readback entirely.
   */
  buffersSelection(): BuffersSubscription {
    if (this._buffersSelectionCache !== undefined) return this._buffersSelectionCache
    const union: BuffersSubscription = new Map()
    for (const c of this._consumers.values()) {
      if (!c.features.has('buffers')) continue
      for (const [name, entry] of c.buffers) {
        const existing = union.get(name)
        if (existing === undefined) {
          union.set(name, { mode: entry.mode, thumbSize: entry.thumbSize })
        } else if (existing.mode !== 'stream') {
          // 'stream' dominates 'thumbnail'; upgrade if any consumer
          // asks for stream. For thumbnails, keep the max thumbSize.
          if (entry.mode === 'stream') {
            existing.mode = 'stream'
            existing.thumbSize = undefined
          } else {
            const a = existing.thumbSize ?? 256
            const b = entry.thumbSize ?? 256
            if (b > a) existing.thumbSize = b
          }
        }
      }
    }
    this._buffersSelectionCache = union
    return union
  }

  /** Is any consumer subscribed to this feature right now? */
  isActive(feature: DebugFeature): boolean {
    return this._active().has(feature)
  }

  /** The full set of features at least one consumer is subscribed to. */
  active(): ReadonlySet<DebugFeature> {
    return this._active()
  }

  /** Number of registered consumers (post-prune). */
  size(): number {
    return this._consumers.size
  }

  /** Look up a consumer's feature set. Used by subscribe:ack to echo back. */
  featuresFor(id: string): readonly DebugFeature[] | null {
    const c = this._consumers.get(id)
    return c ? Array.from(c.features) : null
  }

  /** Clear all state. Used on dispose. */
  dispose(): void {
    this._consumers.clear()
    this._activeCache = null
    this._registrySelectionCache = undefined
    this._buffersSelectionCache = undefined
  }

  private _active(): Set<DebugFeature> {
    if (this._activeCache) return this._activeCache
    const union = new Set<DebugFeature>()
    for (const c of this._consumers.values()) {
      for (const f of c.features) union.add(f)
    }
    this._activeCache = union
    return union
  }
}
