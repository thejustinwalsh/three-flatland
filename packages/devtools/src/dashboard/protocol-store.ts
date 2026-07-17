/**
 * Session-scoped protocol log store, scoped per producer.
 *
 * One IndexedDB object store holds every inbound/outbound bus message.
 * Entries carry the `providerId` they were captured against (whichever
 * producer was selected at the time). Per-provider totals + caches mean
 * swapping producers in the UI preserves each stream's history — no
 * cross-contamination, no data loss on switch.
 *
 * IDB layout: one object store keyed by `id` (monotonic across the
 * whole session so we never reuse numbers), with a non-unique
 * `providerId` index for range queries scoped to a provider. Wiped on
 * construction — the dashboard is a throwaway inspector.
 *
 * Writes batch through `WRITE_FLUSH_MS` into a single transaction so
 * even a flood of `buffer:chunk` messages doesn't cost per-entry round
 * trips.
 *
 * IDB quota is bounded by a byte budget (see `ProtocolStoreOptions`),
 * derived from `navigator.storage.estimate()` when available. Once the
 * approximate stored-byte total crosses the budget, the oldest entries
 * (by monotonic id, across all providers) are pruned in a throttled
 * pass — never touching a provider's pinned tail cache window, the
 * same `TAIL_CACHE` boundary `_evictIfNeeded` already respects for the
 * in-memory cache. `retainedRange` reports what actually survives per
 * provider so later time-travel work can claim an honest scrubbable
 * range.
 */

/** One log record. */
export interface LogEntry {
  id: number
  providerId: string
  at: number
  direction: 'in' | 'out'
  type: string
  tag?: string
  frame?: number
  bytes: number
  msg: unknown
}

/** What a provider's history currently spans in IDB, post-pruning. */
export interface RetainedRange {
  oldestId: number
  newestId: number
  oldestFrame?: number
  newestFrame?: number
}

/** Constructor overrides — production uses the defaults; tests inject
 *  fixed budgets/clocks/timings for determinism. */
export interface ProtocolStoreOptions {
  /** Skip `navigator.storage.estimate()` entirely and use this fixed
   *  byte budget. Primarily for tests. */
  byteBudget?: number
  /** Ceiling on the computed budget even when quota is enormous.
   *  Default `HARD_CAP_BYTES`. */
  hardCapBytes?: number
  /** Fraction of browser storage headroom (quota - usage) claimed as
   *  budget. Default `QUOTA_FRACTION`. */
  quotaFraction?: number
  /** Budget used when `navigator.storage.estimate()` is unavailable or
   *  throws (non-secure context, older browser, jsdom-like test DOM).
   *  Default `FALLBACK_BUDGET_BYTES`. */
  fallbackBudgetBytes?: number
  /** Minimum pushes between prune passes. Default `PRUNE_EVERY_N_WRITES`. */
  pruneEveryNWrites?: number
  /** Minimum ms between prune passes. Default `PRUNE_INTERVAL_MS`. */
  pruneIntervalMs?: number
  /** Write-batch flush delay. Default `WRITE_FLUSH_MS`. */
  writeFlushMs?: number
  /** Injectable clock for deterministic throttle tests. Default `Date.now`. */
  now?: () => number
}

const DB_NAME = 'tf-devtools-protocol'
const STORE = 'messages'
const INDEX = 'by-provider'
const WRITE_FLUSH_MS = 80
const TAIL_CACHE = 400
const LRU_MAX = 4000

// Quota policy defaults (see `ProtocolStoreOptions` for overrides).
/** Generous but bounded per-session ceiling, regardless of how much
 *  free disk the browser reports. */
const HARD_CAP_BYTES = 64 * 1024 * 1024
/** Claim at most this fraction of the browser's remaining storage
 *  headroom — the dashboard is a debugging aid, not the app's primary
 *  storage consumer. */
const QUOTA_FRACTION = 0.1
/** Used when `navigator.storage.estimate()` is unavailable. */
const FALLBACK_BUDGET_BYTES = 16 * 1024 * 1024
/** Prune throttle: don't re-evaluate more than once per this many pushes. */
const PRUNE_EVERY_N_WRITES = 200
/** Prune throttle: nor more than once per this many ms — whichever
 *  threshold (writes or interval) is reached first triggers a pass. */
const PRUNE_INTERVAL_MS = 5000
/** Cap on rows deleted per pass so one prune doesn't hold the IDB
 *  transaction open too long; a heavily over-budget store catches up
 *  over several throttled passes instead of one large stall. */
const PRUNE_BATCH_SIZE = 500
/** After this many consecutive no-progress self-heal retries (see
 *  `_triggerPrune`), stop retrying on a timer and fall back to the
 *  normal write/interval throttle — avoids spinning forever when
 *  everything left over budget is inside some provider's tail window. */
const PRUNE_MAX_EMPTY_RETRIES = 3
/** Approx fixed overhead per stored record — the id/providerId/at/
 *  direction/type/tag/frame fields plus IndexedDB's own per-key
 *  bookkeeping — added on top of the already-tracked wire `bytes`. */
const ENTRY_OVERHEAD_BYTES = 96

type Listener = () => void
/**
 * Fired after a write-batch transaction actually COMMITS to IDB — not
 * merely accepted into `push()`'s in-memory write buffer. `addListener`
 * (`_fire`) already covers "something changed, re-render"; this is
 * strictly narrower and exists for consumers that read persisted rows
 * back out via `queryFiltered`/`prefetchRange` (an async IDB cursor),
 * where a query issued between `push()` and the batch's eventual
 * commit would silently miss the newest rows and never know to retry
 * (#29 Phase C review fix — see the registry panel's reconstruction
 * effect for the motivating case).
 */
type FlushListener = (providerIds: ReadonlySet<string>) => void

interface ProviderState {
  maxId: number
  /** Ids belonging to this provider, kept as a dense, append-ordered
   *  array. Used so visual-index → id mapping doesn't have to
   *  round-trip IDB. Pruned ids are removed from this array in
   *  lockstep with their IDB row deletion, so it always reflects what's
   *  actually retained — `statsFor().total` is derived from its length
   *  rather than tracked separately, so the two can never drift. */
  ids: number[]
  /** Frame value of the newest entry (id === maxId), if it carried one. */
  newestFrame?: number
  /** Frame value of the oldest currently-retained entry (`ids[0]`), if
   *  it carried one. Advances as pruning trims the retained window. */
  oldestFrame?: number
}

/**
 * Cheap per-entry byte estimate used for budget accounting. Not a
 * structured-clone size audit: it undercounts entries whose `msg`
 * payload's real stored footprint runs meaningfully larger than its
 * wire `bytes` count (e.g. deeply nested objects with long, repeated
 * key names — `ENTRY_OVERHEAD_BYTES` is a fixed constant, not
 * proportional to key count), and overcounts tiny entries relative to
 * their true stored size. Good enough to keep total usage within
 * budget order-of-magnitude; not a substitute for
 * `navigator.storage.estimate()` if a byte-exact figure is ever needed.
 */
function estimateEntryBytes(entry: Pick<LogEntry, 'bytes'>): number {
  return entry.bytes + ENTRY_OVERHEAD_BYTES
}

export class ProtocolStore {
  /** Running global byte counters — independent of provider scope. */
  bytesIn = 0
  bytesOut = 0
  /** Union of every `type` we've seen since construction — used by the
   *  protocol filter UI to populate its type-multiselect. */
  knownTypes = new Set<string>()

  private _db: IDBDatabase | null = null
  private _dbReady: Promise<IDBDatabase>
  private _nextId = 1
  private _providers = new Map<string, ProviderState>()
  /** Cache: `${providerId}:${id}` → entry. Always contains each
   *  provider's most recent TAIL_CACHE entries to keep tail sync. */
  private _cache = new Map<string, LogEntry>()
  private _writeBuffer: LogEntry[] = []
  private _flushTimer: number | null = null
  private _writeFlushMs: number
  private _listeners = new Set<Listener>()
  private _flushListeners = new Set<FlushListener>()
  private _pendingRanges = new Map<string, Promise<void>>()

  private _opts: ProtocolStoreOptions
  /** Approximate total bytes currently held in IDB (see `estimateEntryBytes`). */
  private _bytesStored = 0
  private _byteBudget: number
  private _writesSinceProbe = 0
  private _lastPruneAt: number
  private _pruning = false
  private _pruneRetryTimer: number | null = null
  /** One-shot timer armed when a push leaves the store over budget but
   *  throttled (see `_maybePrune`) — re-evaluates once the interval
   *  elapses even if nothing pushes again in the meantime. */
  private _pruneArmTimer: number | null = null
  private _consecutiveEmptyPasses = 0
  private _disposed = false

  constructor(options: ProtocolStoreOptions = {}) {
    this._opts = options
    this._writeFlushMs = options.writeFlushMs ?? WRITE_FLUSH_MS
    // Safe synchronous default so pruning can engage immediately; an
    // explicit `byteBudget` override never needs the async estimate.
    this._byteBudget = options.byteBudget ?? options.fallbackBudgetBytes ?? FALLBACK_BUDGET_BYTES
    this._lastPruneAt = this._now()
    this._dbReady = this._openAndWipe()
    void this._initByteBudget()
  }

  private _now(): number {
    return this._opts.now?.() ?? Date.now()
  }

  /** Byte budget currently in effect (post-estimate, once resolved). */
  get byteBudget(): number {
    return this._byteBudget
  }

  private async _initByteBudget(): Promise<void> {
    if (this._opts.byteBudget !== undefined) return // fixed override, already applied
    const hardCap = this._opts.hardCapBytes ?? HARD_CAP_BYTES
    const fraction = this._opts.quotaFraction ?? QUOTA_FRACTION
    const fallback = this._opts.fallbackBudgetBytes ?? FALLBACK_BUDGET_BYTES
    try {
      const storage = (globalThis.navigator as Navigator | undefined)?.storage
      if (storage?.estimate === undefined) {
        this._byteBudget = fallback
        return
      }
      const { quota, usage } = await storage.estimate()
      if (quota === undefined) {
        this._byteBudget = fallback
        return
      }
      const headroom = Math.max(0, quota - (usage ?? 0))
      this._byteBudget = Math.min(hardCap, Math.floor(headroom * fraction))
    } catch {
      this._byteBudget = fallback
    }
  }

  private async _openAndWipe(): Promise<IDBDatabase> {
    // Try open at v1. If the store/index layout doesn't match (older
    // session stored a different schema), delete the DB and reopen.
    const db = await this._open()
    this._db = db
    // Wipe on mount — dashboard is single-session.
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    })
    return db
  }

  private _open(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2)
      req.onupgradeneeded = () => {
        const d = req.result
        if (d.objectStoreNames.contains(STORE)) d.deleteObjectStore(STORE)
        const store = d.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex(INDEX, 'providerId', { unique: false })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
    })
  }

  addListener(cb: Listener): () => void {
    this._listeners.add(cb)
    return () => { this._listeners.delete(cb) }
  }

  /**
   * Subscribe to post-commit write-batch notifications. Fires only
   * after a batch's IDB transaction actually completes (never on a
   * failed/aborted one — see `_writeBatch`'s `tx.oncomplete`), with the
   * set of provider ids the just-committed batch touched. Use this
   * (not `addListener`) when a caller is about to re-run an IDB query
   * and needs to know when freshly-pushed rows are actually queryable.
   */
  addFlushListener(cb: FlushListener): () => void {
    this._flushListeners.add(cb)
    return () => { this._flushListeners.delete(cb) }
  }

  private _fireFlush(providerIds: ReadonlySet<string>): void {
    for (const cb of this._flushListeners) {
      try { cb(providerIds) } catch { /* listener errors shouldn't break the store */ }
    }
  }

  private _fire(): void {
    for (const cb of this._listeners) {
      try { cb() } catch { /* ignore */ }
    }
  }

  /**
   * Per-provider counters. Returns zeros if the provider isn't known.
   * `total` always equals `ids.length` — the count of currently
   * retained rows, not a lifetime push count — so it stays valid as a
   * denominator/index bound for `protocol-log.tsx`'s virtualization
   * math even after pruning shrinks `ids`.
   */
  statsFor(providerId: string | null): { total: number; maxId: number; ids: number[] } {
    if (providerId === null) return { total: 0, maxId: 0, ids: [] }
    const s = this._providers.get(providerId)
    if (s === undefined) return { total: 0, maxId: 0, ids: [] }
    return { total: s.ids.length, maxId: s.maxId, ids: s.ids }
  }

  /** All provider ids currently tracked in the store. */
  providers(): string[] {
    return Array.from(this._providers.keys())
  }

  /**
   * Append a new entry. Global id is monotonic across providers; per-
   * provider totals and index arrays grow independently.
   */
  push(providerId: string, partial: Omit<LogEntry, 'id' | 'providerId'>): LogEntry {
    const id = this._nextId++
    const entry: LogEntry = { ...partial, id, providerId }
    const key = cacheKey(providerId, id)
    this._cache.set(key, entry)
    let ps = this._providers.get(providerId)
    if (ps === undefined) {
      ps = { maxId: 0, ids: [] }
      this._providers.set(providerId, ps)
    }
    ps.maxId = id
    ps.ids.push(id)
    ps.newestFrame = partial.frame
    if (ps.ids.length === 1) ps.oldestFrame = partial.frame

    if (partial.direction === 'in') this.bytesIn += partial.bytes
    else this.bytesOut += partial.bytes
    this.knownTypes.add(partial.type)

    this._bytesStored += estimateEntryBytes(entry)
    this._writesSinceProbe++

    this._writeBuffer.push(entry)
    if (this._flushTimer === null) {
      this._flushTimer = (globalThis.setTimeout as unknown as (cb: () => void, ms: number) => number)(
        () => this._flush(),
        this._writeFlushMs,
      )
    }
    this._evictIfNeeded(providerId)
    this._maybePrune()
    this._fire()
    return entry
  }

  /**
   * Ids + frame span a provider's history currently occupies in IDB.
   * Cheap — reads live counters/watermarks kept in sync on write and
   * prune rather than querying IDB. `null` if the provider is unknown
   * or has nothing retained (shouldn't happen for a known provider —
   * the tail is always pinned — but guarded for `clear()` races).
   */
  retainedRange(providerId: string): RetainedRange | null {
    const ps = this._providers.get(providerId)
    if (ps === undefined || ps.ids.length === 0) return null
    return {
      oldestId: ps.ids[0]!,
      newestId: ps.maxId,
      oldestFrame: ps.oldestFrame,
      newestFrame: ps.newestFrame,
    }
  }

  /** Wipe everything (memory + IDB + counters). */
  clear(): void {
    this._cache.clear()
    this._providers.clear()
    this._writeBuffer.length = 0
    this._nextId = 1
    this.bytesIn = 0
    this.bytesOut = 0
    this.knownTypes.clear()
    this._bytesStored = 0
    this._writesSinceProbe = 0
    this._consecutiveEmptyPasses = 0
    if (this._pruneRetryTimer !== null) {
      clearTimeout(this._pruneRetryTimer)
      this._pruneRetryTimer = null
    }
    if (this._pruneArmTimer !== null) {
      clearTimeout(this._pruneArmTimer)
      this._pruneArmTimer = null
    }
    if (this._db !== null) {
      try {
        const tx = this._db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).clear()
      } catch { /* db closing */ }
    }
    this._fire()
  }

  /** Sync cache lookup. */
  peek(providerId: string, id: number): LogEntry | null {
    return this._cache.get(cacheKey(providerId, id)) ?? null
  }

  /** Ensure the given contiguous-in-ids-array range is in the cache. */
  async prefetchRange(providerId: string, startId: number, endId: number): Promise<void> {
    if (startId > endId) return
    const key = `${providerId}:${startId}:${endId}`
    const existing = this._pendingRanges.get(key)
    if (existing !== undefined) return existing
    // Quick hit check.
    let allHit = true
    for (let id = startId; id <= endId; id++) {
      if (!this._cache.has(cacheKey(providerId, id))) { allHit = false; break }
    }
    if (allHit) return
    const promise = this._readRange(providerId, startId, endId)
    this._pendingRanges.set(key, promise)
    try {
      await promise
    } finally {
      this._pendingRanges.delete(key)
    }
  }

  /**
   * Walk every entry in the store belonging to `providerId` and return
   * the ids of those that satisfy `predicate`. Matching entries are
   * also hydrated into the cache as a side-effect so rendering them
   * afterwards is synchronous.
   *
   * `signal` lets the caller bail the cursor early when the filter
   * changes under their feet — cursor walks on large sessions can take
   * tens of ms and we don't want stale results racing fresh ones.
   */
  async queryFiltered(
    providerId: string,
    predicate: (entry: LogEntry) => boolean,
    signal?: { aborted: boolean },
  ): Promise<number[]> {
    const db = await this._dbReady
    const out: number[] = []
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const index = store.index(INDEX)
      const req = index.openCursor(IDBKeyRange.only(providerId))
      req.onsuccess = () => {
        if (signal?.aborted === true) { resolve(); return }
        const cursor = req.result
        if (cursor === null) { resolve(); return }
        const entry = cursor.value as LogEntry
        if (predicate(entry)) {
          out.push(entry.id)
          const key = cacheKey(providerId, entry.id)
          if (!this._cache.has(key)) this._cache.set(key, entry)
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
    })
    // Cursor yields in key order (ascending id) which matches our
    // expected rendering direction (newest-first = reverse).
    return out
  }

  private async _readRange(providerId: string, startId: number, endId: number): Promise<void> {
    const db = await this._dbReady
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const range = IDBKeyRange.bound(startId, endId, false, false)
      const req = store.getAll(range)
      req.onsuccess = () => {
        for (const entry of req.result as LogEntry[]) {
          if (entry.providerId !== providerId) continue
          const key = cacheKey(entry.providerId, entry.id)
          if (!this._cache.has(key)) this._cache.set(key, entry)
        }
        resolve()
      }
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
    })
    this._fire()
  }

  private _flush(): void {
    this._flushTimer = null
    if (this._disposed) return
    if (this._writeBuffer.length === 0) return
    const batch = this._writeBuffer
    this._writeBuffer = []
    void this._writeBatch(batch)
  }

  private async _writeBatch(batch: LogEntry[]): Promise<void> {
    const db = await this._dbReady
    let tx: IDBTransaction | undefined
    try {
      tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const entry of batch) store.put(entry)
      tx.onerror = () => {
        console.warn('[devtools-dashboard] IDB write failed:', tx?.error)
        this._rollbackBatch(batch)
      }
      // Only fires on a genuine commit (never alongside `onerror` — a
      // transaction either completes or aborts/errors, never both), so
      // this is the honest "these rows are now queryable" signal.
      tx.oncomplete = () => {
        const providerIds = new Set<string>()
        for (const entry of batch) providerIds.add(entry.providerId)
        this._fireFlush(providerIds)
      }
    } catch (err) {
      console.warn('[devtools-dashboard] IDB transaction failed:', err)
      // A `put()` can throw synchronously partway through the loop
      // (e.g. a non-clonable payload) after earlier entries in the
      // same batch already queued successfully. Abort so none of this
      // batch commits — otherwise the full-batch rollback below would
      // zero out accounting for rows IDB actually still has.
      try { tx?.abort() } catch { /* transaction already finished */ }
      this._rollbackBatch(batch)
    }
  }

  /**
   * Undo the in-memory accounting for a batch that never made it into
   * IDB. Without this, `_bytesStored` and each provider's `ids` keep
   * counting rows that don't actually exist there — pruning would then
   * run from an inflated byte count, and `retainedRange`/`statsFor`
   * could report ids that a `queryFiltered`/`prefetchRange` call can
   * never actually find.
   */
  private _rollbackBatch(batch: LogEntry[]): void {
    const failedByProvider = new Map<string, Set<number>>()
    for (const entry of batch) {
      this._bytesStored -= estimateEntryBytes(entry)
      this._cache.delete(cacheKey(entry.providerId, entry.id))
      let ids = failedByProvider.get(entry.providerId)
      if (ids === undefined) {
        ids = new Set()
        failedByProvider.set(entry.providerId, ids)
      }
      ids.add(entry.id)
    }
    for (const [providerId, failedIds] of failedByProvider) {
      const ps = this._providers.get(providerId)
      if (ps === undefined) continue
      ps.ids = ps.ids.filter((id) => !failedIds.has(id))
      if (ps.ids.length === 0) {
        ps.maxId = 0
        ps.newestFrame = undefined
        ps.oldestFrame = undefined
      } else {
        ps.maxId = ps.ids[ps.ids.length - 1]!
        ps.newestFrame = this._cache.get(cacheKey(providerId, ps.maxId))?.frame
        ps.oldestFrame = this._cache.get(cacheKey(providerId, ps.ids[0]!))?.frame
      }
    }
    this._fire()
  }

  /**
   * Id below which an entry falls outside a provider's pinned tail
   * window. Ids are global-monotonic across every provider, so a fixed
   * offset from `maxId` (`maxId - TAIL_CACHE + 1`) only isolates that
   * provider's own newest `TAIL_CACHE` entries when it's the sole
   * writer — with interleaved providers the same id span holds a mix
   * of everyone's rows, under-protecting this provider's actual recent
   * history. Indexing `ps.ids` (per-provider, append-ordered, so
   * ascending) counts *entries* instead of *id values*, which stays
   * correct regardless of interleaving. Fewer than `TAIL_CACHE` entries
   * total → everything is tail, so nothing can be `< ` the cutoff.
   */
  private _tailCutoffId(ps: ProviderState): number {
    const idx = ps.ids.length - TAIL_CACHE
    return idx > 0 ? ps.ids[idx]! : Number.NEGATIVE_INFINITY
  }

  /** LRU eviction, keyed per-provider. Tail always pinned. */
  private _evictIfNeeded(providerId: string): void {
    if (this._cache.size <= LRU_MAX) return
    const ps = this._providers.get(providerId)
    if (ps === undefined) return
    const keepFrom = this._tailCutoffId(ps)
    const toDrop: string[] = []
    for (const k of this._cache.keys()) {
      if (!k.startsWith(`${providerId}:`)) continue
      const id = parseInt(k.slice(providerId.length + 1), 10)
      if (id < keepFrom) toDrop.push(k)
      if (this._cache.size - toDrop.length <= LRU_MAX) break
    }
    for (const k of toDrop) this._cache.delete(k)
  }

  /**
   * Decide whether a prune pass is due: over budget AND (enough writes
   * or enough time since the last pass). Throttled so a flood of
   * pushes doesn't re-run the IDB cursor walk per-message — the pass
   * itself is async and re-entrancy-guarded by `_pruning`. Skipped
   * while a self-heal retry (see `_triggerPrune`) is already pending.
   *
   * This only ever runs from `push()` — a short over-budget burst
   * followed by silence (no further pushes) would otherwise never
   * prune, since nothing else re-evaluates the throttle. When over
   * budget but not yet due, arm a one-shot timer for whatever's left
   * of the interval so the store still self-heals on a quiet
   * connection.
   */
  private _maybePrune(): void {
    if (this._disposed) return
    if (this._pruning || this._pruneRetryTimer !== null) return
    if (this._bytesStored <= this._byteBudget) {
      this._clearArmedPruneTimer()
      return
    }
    const everyNWrites = this._opts.pruneEveryNWrites ?? PRUNE_EVERY_N_WRITES
    const intervalMs = this._opts.pruneIntervalMs ?? PRUNE_INTERVAL_MS
    const now = this._now()
    const dueByWrites = this._writesSinceProbe >= everyNWrites
    const dueByInterval = now - this._lastPruneAt >= intervalMs
    if (!dueByWrites && !dueByInterval) {
      // A non-finite interval (tests disabling interval-based
      // throttling entirely) means "never fire on time alone."
      if (Number.isFinite(intervalMs)) this._armPruneTimer(intervalMs - (now - this._lastPruneAt))
      return
    }
    this._clearArmedPruneTimer()
    this._writesSinceProbe = 0
    this._lastPruneAt = now
    this._triggerPrune()
  }

  private _armPruneTimer(delayMs: number): void {
    if (this._pruneArmTimer !== null) return
    this._pruneArmTimer = (globalThis.setTimeout as unknown as (cb: () => void, ms: number) => number)(
      () => {
        this._pruneArmTimer = null
        this._maybePrune()
      },
      Math.max(0, delayMs),
    )
  }

  private _clearArmedPruneTimer(): void {
    if (this._pruneArmTimer !== null) {
      clearTimeout(this._pruneArmTimer)
      this._pruneArmTimer = null
    }
  }

  /**
   * Run a pass, then self-heal: if we're still over budget afterward
   * (a batch-cap-limited pass, or a pass that ran before a just-issued
   * write batch had landed in IDB), retry shortly without waiting on
   * the next `push()` to re-arm the throttle. Caps at
   * `PRUNE_MAX_EMPTY_RETRIES` consecutive no-progress passes so a
   * store that's permanently over budget (everything left is inside
   * some provider's tail window) doesn't spin a timer forever — the
   * normal write/interval throttle picks it back up on the next push.
   */
  private _triggerPrune(): void {
    this._pruning = true
    void this._runPrune().then((madeProgress) => {
      this._pruning = false
      if (this._disposed) return
      this._consecutiveEmptyPasses = madeProgress ? 0 : this._consecutiveEmptyPasses + 1
      const shouldRetry =
        this._bytesStored > this._byteBudget && this._consecutiveEmptyPasses < PRUNE_MAX_EMPTY_RETRIES
      if (shouldRetry && this._pruneRetryTimer === null) {
        this._pruneRetryTimer = (globalThis.setTimeout as unknown as (cb: () => void, ms: number) => number)(
          () => {
            this._pruneRetryTimer = null
            if (this._disposed) return
            this._triggerPrune()
          },
          this._writeFlushMs + 20,
        )
      }
    })
  }

  /**
   * Delete the oldest entries (by monotonic id, across all providers)
   * until back under budget or `PRUNE_BATCH_SIZE` rows are gone,
   * whichever comes first — all inside one transaction. An entry is
   * never touched while it's inside its own provider's pinned tail
   * window (`maxId - TAIL_CACHE + 1`), the same boundary
   * `_evictIfNeeded` already protects in the in-memory cache: a
   * provider that hasn't yet written past its own tail size keeps its
   * full history even if it happens to hold the globally-oldest ids.
   *
   * Returns whether anything was actually deleted, so the caller can
   * decide whether a self-heal retry is worth scheduling.
   */
  private async _runPrune(): Promise<boolean> {
    const overBudget = this._bytesStored - this._byteBudget
    if (overBudget <= 0) return false
    const db = await this._dbReady
    const deletedIdsByProvider = new Map<string, Set<number>>()
    const newOldestByProvider = new Map<string, number | undefined>()
    let freed = 0
    let deletedCount = 0

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const req = store.openCursor() // ascending by id (the primary key) — oldest first.
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor === null) return
        if (freed >= overBudget || deletedCount >= PRUNE_BATCH_SIZE) return
        const entry = cursor.value as LogEntry
        const ps = this._providers.get(entry.providerId)
        // No live provider state (e.g. orphaned by a failed `clear()`
        // transaction) — leave it untouched rather than guess.
        const eligible = ps !== undefined && entry.id < this._tailCutoffId(ps)
        const deletedForProvider = deletedIdsByProvider.get(entry.providerId)
        if (eligible) {
          cursor.delete()
          freed += estimateEntryBytes(entry)
          deletedCount++
          let ids = deletedForProvider
          if (ids === undefined) {
            ids = new Set()
            deletedIdsByProvider.set(entry.providerId, ids)
          }
          ids.add(entry.id)
        } else if (deletedForProvider !== undefined && !newOldestByProvider.has(entry.providerId)) {
          // First surviving entry for a provider we've been pruning —
          // becomes its new retained watermark.
          newOldestByProvider.set(entry.providerId, entry.frame)
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    })

    if (deletedIdsByProvider.size === 0) return false
    this._bytesStored -= freed
    for (const [providerId, deletedIds] of deletedIdsByProvider) {
      const ps = this._providers.get(providerId)
      if (ps === undefined) continue
      ps.ids = ps.ids.filter((id) => !deletedIds.has(id))
      if (newOldestByProvider.has(providerId)) {
        ps.oldestFrame = newOldestByProvider.get(providerId)
      } else if (ps.ids.length === 0) {
        ps.oldestFrame = undefined
      } else {
        // The pass stopped (batch cap / budget satisfied) before the
        // cursor reached this provider's first survivor, so its frame
        // was never observed this pass — `ps.oldestFrame` still names
        // a row we just deleted above. Best-effort recover from the
        // cache; otherwise mark unknown rather than report stale data.
        // A later pass (or any read that hydrates `ids[0]` into the
        // cache) will resolve it for real.
        ps.oldestFrame = this._cache.get(cacheKey(providerId, ps.ids[0]!))?.frame
      }
      for (const id of deletedIds) this._cache.delete(cacheKey(providerId, id))
    }
    this._fire()
    return true
  }

  /**
   * Cancel every pending timer (write flush, prune self-heal retry,
   * the throttle-interval arm) and close the IDB connection. Every
   * timer callback checks `_disposed` and no-ops rather than
   * rescheduling itself once this has run.
   *
   * `getProtocolStore()` never replaces its singleton today, so no
   * call site needs this yet — it's exported for whichever one
   * eventually does (dashboard teardown, or a reset that swaps in a
   * fresh store). Without it, an abandoned instance's stale timers
   * could keep firing against the shared hardcoded `DB_NAME` behind a
   * still-live replacement's back.
   */
  dispose(): void {
    this._disposed = true
    if (this._flushTimer !== null) {
      clearTimeout(this._flushTimer)
      this._flushTimer = null
    }
    if (this._pruneRetryTimer !== null) {
      clearTimeout(this._pruneRetryTimer)
      this._pruneRetryTimer = null
    }
    if (this._pruneArmTimer !== null) {
      clearTimeout(this._pruneArmTimer)
      this._pruneArmTimer = null
    }
    this._listeners.clear()
    this._flushListeners.clear()
    this._db?.close()
  }
}

function cacheKey(providerId: string, id: number): string {
  return `${providerId}:${id}`
}

let _instance: ProtocolStore | null = null
export function getProtocolStore(): ProtocolStore {
  if (_instance === null) _instance = new ProtocolStore()
  return _instance
}
