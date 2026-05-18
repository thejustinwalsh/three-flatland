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

const DB_NAME = 'tf-devtools-protocol'
const STORE = 'messages'
const INDEX = 'by-provider'
const WRITE_FLUSH_MS = 80
const TAIL_CACHE = 400
const LRU_MAX = 4000

type Listener = () => void

interface ProviderState {
  total: number
  maxId: number
  /** Ids belonging to this provider, kept as a dense array. Used so
   *  visual-index → id mapping doesn't have to round-trip IDB. */
  ids: number[]
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
  private _listeners = new Set<Listener>()
  private _pendingRanges = new Map<string, Promise<void>>()

  constructor() {
    this._dbReady = this._openAndWipe()
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
      tx.onerror = () => reject(tx.error)
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
      req.onerror = () => reject(req.error)
    })
  }

  addListener(cb: Listener): () => void {
    this._listeners.add(cb)
    return () => { this._listeners.delete(cb) }
  }

  private _fire(): void {
    for (const cb of this._listeners) {
      try { cb() } catch { /* ignore */ }
    }
  }

  /** Per-provider counters. Returns zeros if the provider isn't known. */
  statsFor(providerId: string | null): { total: number; maxId: number; ids: number[] } {
    if (providerId === null) return { total: 0, maxId: 0, ids: [] }
    const s = this._providers.get(providerId)
    return s !== undefined ? s : { total: 0, maxId: 0, ids: [] }
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
      ps = { total: 0, maxId: 0, ids: [] }
      this._providers.set(providerId, ps)
    }
    ps.total++
    ps.maxId = id
    ps.ids.push(id)

    if (partial.direction === 'in') this.bytesIn += partial.bytes
    else this.bytesOut += partial.bytes
    this.knownTypes.add(partial.type)

    this._writeBuffer.push(entry)
    if (this._flushTimer === null) {
      this._flushTimer = (globalThis.setTimeout as unknown as (cb: () => void, ms: number) => number)(
        () => this._flush(),
        WRITE_FLUSH_MS,
      )
    }
    this._evictIfNeeded(providerId)
    this._fire()
    return entry
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
      req.onerror = () => reject(req.error)
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
      req.onerror = () => reject(req.error)
    })
    this._fire()
  }

  private _flush(): void {
    this._flushTimer = null
    if (this._writeBuffer.length === 0) return
    const batch = this._writeBuffer
    this._writeBuffer = []
    void this._writeBatch(batch)
  }

  private async _writeBatch(batch: LogEntry[]): Promise<void> {
    const db = await this._dbReady
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const entry of batch) store.put(entry)
      tx.onerror = () => {
        console.warn('[devtools-dashboard] IDB write failed:', tx.error)
      }
    } catch (err) {
      console.warn('[devtools-dashboard] IDB transaction failed:', err)
    }
  }

  /** LRU eviction, keyed per-provider. Tail always pinned. */
  private _evictIfNeeded(providerId: string): void {
    if (this._cache.size <= LRU_MAX) return
    const ps = this._providers.get(providerId)
    if (ps === undefined) return
    const keepFrom = ps.maxId - TAIL_CACHE + 1
    const toDrop: string[] = []
    for (const k of this._cache.keys()) {
      if (!k.startsWith(`${providerId}:`)) continue
      const id = parseInt(k.slice(providerId.length + 1), 10)
      if (id < keepFrom) toDrop.push(k)
      if (this._cache.size - toDrop.length <= LRU_MAX) break
    }
    for (const k of toDrop) this._cache.delete(k)
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
