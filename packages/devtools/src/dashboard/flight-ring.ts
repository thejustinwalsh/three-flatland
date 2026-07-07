/**
 * Flight recorder ring (#29 Phase C — slice 2: ring + freeze).
 *
 * A rolling in-memory ring covering the single selected buffer's
 * encoded chunks plus a lightweight log of stats-batch arrivals,
 * retained per issue #29's storage policy: ~10s for a selected
 * buffer's chunks, ~30s for stats. Protocol log rows already persist
 * through `ProtocolStore` (slice 1) and are NOT duplicated here — the
 * frozen view reads protocol history through the store's own
 * `retainedRange`.
 *
 * Stats retention here is deliberately just a `(frame, receivedAt)`
 * log, not a copy of the stat values themselves: `DevtoolsState.series`
 * already holds per-frame values and the Stats panel already reads it
 * directly by frame cursor (#29 Phase A), live or parked — freeze
 * doesn't change that. What freeze changes is how far BACK the
 * scrubber is allowed to claim, and `series` is a fixed-size ring
 * (~17s at 60fps) shorter than the 30s the storage policy promises.
 * This log exists so the scrubber's frozen range can honestly reflect
 * that promise without duplicating every stat field.
 *
 * "Freeze" clones the live ring — a cheap array copy, since chunk
 * payloads are already immutable — so a parked scrub session keeps
 * working even as live ingest keeps writing into (and evicting out of)
 * the live ring underneath it. Live ingest never stops on freeze (#29
 * item 14); only `unfreeze()` drops the snapshot.
 */
import type { BufferChunkPayload } from '../devtools-client.js'

/** Chunks newer than this are always retained for the selected buffer. */
const CHUNK_WINDOW_MS = 10_000
/** Frame-arrival log entries newer than this are always retained. */
const STATS_WINDOW_MS = 30_000

export interface FlightRingOptions {
  /** Injectable clock for deterministic tests. Default `Date.now`. */
  now?: () => number
}

export interface FrameRange {
  min: number
  max: number
}

interface ChunkEntry {
  chunk: BufferChunkPayload
  receivedAt: number
}

interface FrameEntry {
  frame: number
  receivedAt: number
}

export class FlightRing {
  private readonly _now: () => number
  private _bufferName: string | null = null
  private _chunks: ChunkEntry[] = []
  private _frames: FrameEntry[] = []

  constructor(options: FlightRingOptions = {}) {
    this._now = options.now ?? Date.now
  }

  /** The buffer name whose chunks this ring is currently tracking, if any. */
  get bufferName(): string | null {
    return this._bufferName
  }

  /**
   * Switch which buffer's chunks this ring tracks. A buffer switch
   * drops whatever chunks were recorded for the previous selection —
   * a decode chain can't span two different buffers' streams.
   */
  setBufferName(name: string | null): void {
    if (this._bufferName === name) return
    this._bufferName = name
    this._chunks = []
  }

  /**
   * Record one encoded chunk. Ignored when it's for a buffer other
   * than the tracked one, or when the ring is still empty and the
   * chunk isn't a keyframe — mirrors the live decoder's own "wait for
   * the first keyframe" gate (buffers.tsx): a leading delta can never
   * be decoded, so it's not worth retaining.
   */
  pushChunk(chunk: BufferChunkPayload): void {
    if (this._bufferName === null || chunk.name !== this._bufferName) return
    if (this._chunks.length === 0 && !chunk.keyFrame) return
    this._chunks.push({ chunk, receivedAt: this._now() })
    this._evictChunks()
  }

  /** Record that a stats batch carrying `frame` just arrived. */
  pushFrame(frame: number): void {
    this._frames.push({ frame, receivedAt: this._now() })
    this._evictFrames()
  }

  /**
   * Drop chunks older than `CHUNK_WINDOW_MS`, but never past the
   * newest keyframe that itself falls outside the window — the ring's
   * first entry must always be a keyframe (or the ring is empty) so a
   * frozen snapshot can always decode from its own start. When no
   * out-of-window keyframe exists yet (e.g. the keyframe cadence
   * hasn't produced a second keyframe), nothing is evicted even though
   * that leaves more than the nominal window retained.
   */
  private _evictChunks(): void {
    const cutoff = this._now() - CHUNK_WINDOW_MS
    let anchor = -1
    for (let i = 0; i < this._chunks.length; i++) {
      const entry = this._chunks[i]!
      if (entry.receivedAt > cutoff) break
      if (entry.chunk.keyFrame) anchor = i
    }
    if (anchor > 0) this._chunks.splice(0, anchor)
  }

  /** Drop frame-arrival entries older than `STATS_WINDOW_MS`. */
  private _evictFrames(): void {
    const cutoff = this._now() - STATS_WINDOW_MS
    let i = 0
    while (i < this._frames.length && this._frames[i]!.receivedAt < cutoff) i++
    if (i > 0) this._frames.splice(0, i)
  }

  /** Frame span of currently retained chunks, or `null` if empty. */
  chunkFrameRange(): FrameRange | null {
    if (this._chunks.length === 0) return null
    return {
      min: this._chunks[0]!.chunk.frame,
      max: this._chunks[this._chunks.length - 1]!.chunk.frame,
    }
  }

  /** Frame span of the currently retained stats-arrival log, or `null` if empty. */
  statsFrameRange(): FrameRange | null {
    if (this._frames.length === 0) return null
    return { min: this._frames[0]!.frame, max: this._frames[this._frames.length - 1]!.frame }
  }

  /**
   * Combined claimable frame range — the intersection of whichever
   * sub-collections currently hold data (only one may, e.g. no buffer
   * selected). `null` when both are empty, or when they share no
   * overlap at all.
   */
  frameRange(): FrameRange | null {
    const chunkRange = this.chunkFrameRange()
    const statsRange = this.statsFrameRange()
    if (chunkRange === null) return statsRange
    if (statsRange === null) return chunkRange
    const min = Math.max(chunkRange.min, statsRange.min)
    const max = Math.min(chunkRange.max, statsRange.max)
    return min <= max ? { min, max } : null
  }

  /**
   * The chunk sequence a `VideoDecoder` needs fed, in order, to render
   * the frame nearest to but not after `frame`: from the nearest
   * keyframe ≤ `frame`, forward through the nearest chunk ≤ `frame`.
   * `null` when the ring holds nothing at or before `frame` (the
   * cursor predates the ring, or nothing has streamed yet).
   */
  decodeChain(frame: number): BufferChunkPayload[] | null {
    let targetIdx = -1
    for (let i = 0; i < this._chunks.length; i++) {
      if (this._chunks[i]!.chunk.frame <= frame) targetIdx = i
      else break
    }
    if (targetIdx === -1) return null
    let anchorIdx = targetIdx
    while (anchorIdx > 0 && !this._chunks[anchorIdx]!.chunk.keyFrame) anchorIdx--
    return this._chunks.slice(anchorIdx, targetIdx + 1).map((entry) => entry.chunk)
  }

  /**
   * Cheap structural copy for freeze — fresh arrays, same (immutable)
   * chunk payload references. Further pushes/evictions on the source
   * ring never touch the clone.
   */
  clone(): FlightRing {
    const copy = new FlightRing({ now: this._now })
    copy._bufferName = this._bufferName
    copy._chunks = this._chunks.slice()
    copy._frames = this._frames.slice()
    return copy
  }
}

// ─── Live/frozen singleton facade ──────────────────────────────────────────
//
// One always-on live ring per dashboard session. Freezing clones it;
// unfreezing drops the clone. Deliberately not provider-scoped in this
// slice — issue #29's "multi-provider semantics" (item 3) is called
// out as unresolved and is out of scope for the single-buffer minimum
// viable flight recorder.

type Listener = () => void

const _listeners = new Set<Listener>()

function fire(): void {
  for (const cb of _listeners) {
    try {
      cb()
    } catch {
      /* listener errors shouldn't break the ring */
    }
  }
}

/** Notified whenever freeze/unfreeze toggles. */
export function addFlightRingListener(cb: Listener): () => void {
  _listeners.add(cb)
  return () => {
    _listeners.delete(cb)
  }
}

let _liveRing = new FlightRing()
let _frozenRing: FlightRing | null = null

/** The always-on live ring. Ingest writes here whether frozen or not. */
export function getLiveRing(): FlightRing {
  return _liveRing
}

export function isFrozen(): boolean {
  return _frozenRing !== null
}

/** Snapshot taken at the freeze moment, or `null` while live. */
export function getFrozenRing(): FlightRing | null {
  return _frozenRing
}

/**
 * Clone the live ring and hold the snapshot. No-op if already frozen —
 * re-freezing isn't exposed in this slice; unfreeze (via `goLive`)
 * first.
 */
export function freeze(): void {
  if (_frozenRing !== null) return
  _frozenRing = _liveRing.clone()
  fire()
}

/** Drop the snapshot and resume reading the live ring. No-op if already live. */
export function unfreeze(): void {
  if (_frozenRing === null) return
  _frozenRing = null
  fire()
}

/** Test-only: replace the live ring and clear any frozen snapshot, so
 *  singleton-level tests don't leak state across cases. */
export function __resetFlightRecorderForTests(ring: FlightRing = new FlightRing()): void {
  _liveRing = ring
  _frozenRing = null
}
