/**
 * Buffer pool for the zero-allocation bus transport.
 *
 * Two hard-coded tiers, chosen from observed watermarks:
 *
 *   small — 4 KB × 8 buffers  (stats batches, lifecycle messages,
 *                              metadata-only registry/buffers deltas)
 *   large — 256 KB × 4 buffers (buffer-pixel payloads, large registry
 *                              samples; also covers thumbnail RT
 *                              readbacks after `maxDim=256` cap)
 *
 * The *worker* allocates the pool on boot and transfers every buffer
 * to the producer at once. The producer holds two free stacks,
 * `acquireSmall` / `acquireLarge` pop from them, messages are written
 * into the acquired buffer, and the buffer is transferred back to the
 * worker via `port.postMessage(buf, [buf])`. The worker decodes,
 * publishes on the `BroadcastChannel`, then bounces the buffer back
 * to the producer's pool via a `POOL_RELEASE` message.
 *
 * Steady state: zero allocations past boot. If a pool empties (the
 * consumer is slow returning buffers), we fall back to a one-off
 * `new ArrayBuffer(tier.size)`, emit a debug warning, and do NOT
 * return that buffer to the pool (detected by byteLength mismatch on
 * release). Warning counters are exposed via `stats()` so the app
 * can surface the number in the pane if ever exhaustion fires.
 */

/** Tier sizes / counts. Hard-coded; bump here if we ever see exhaustion. */
export const POOL = {
  small: { size: 4 * 1024, count: 8 },         // 32 KB
  // Sized to fit the largest debug buffer we routinely drain. With the
  // consumer-driven subscription model only one texture is usually in
  // flight at a time (the currently-viewed thumbnail or the modal's
  // stream), so `count: 4` is plenty. `size: 16 MB` covers rgba16f
  // canvases up to ~2.1M pixels (≈ 1440×1440); larger streams should
  // use `mode: 'thumbnail'` which downsamples before readback. Dev-only.
  large: { size: 16 * 1024 * 1024, count: 4 }, // 64 MB, dev-only
} as const

export type PoolTier = 'small' | 'large'

export interface PoolStats {
  smallFree: number
  largeFree: number
  /** Pool-exhaustion events since construction (one-off `new ArrayBuffer` happened). */
  smallExhausted: number
  largeExhausted: number
  /** Release-with-unknown-size events (buffer was a one-off; GC'd instead of pooled). */
  orphaned: number
}

export class BufferPool {
  private _smallFree: ArrayBuffer[] = []
  private _largeFree: ArrayBuffer[] = []
  private _smallExhausted = 0
  private _largeExhausted = 0
  private _orphaned = 0
  /**
   * Flips to true on the first `seed()` call. Before that, the pool
   * is empty by construction (the worker is still booting and hasn't
   * transferred buffers yet); any `acquire*` in that window is part
   * of the boot race and not a sign of actual shortage. We allocate
   * a one-off as normal but suppress the warning so it doesn't look
   * like a persistent leak.
   */
  private _seeded = false

  /**
   * Seed the pool with buffers transferred in from the worker. Called
   * once per `POOL_INIT` message. Safe to call repeatedly if the
   * worker ever needs to top up (rare; not wired today).
   */
  seed(tier: PoolTier, bufs: ArrayBuffer[]): void {
    for (const b of bufs) {
      if (tier === 'small') this._smallFree.push(b)
      else this._largeFree.push(b)
    }
    this._seeded = true
  }

  acquireSmall(): ArrayBuffer {
    const b = this._smallFree.pop()
    if (b !== undefined) return b
    this._smallExhausted++
    if (this._seeded && (this._smallExhausted & 15) === 1) {
      console.warn(`[devtools] small pool exhausted; allocating one-off. ${this._smallExhausted} events total`)
    }
    return new ArrayBuffer(POOL.small.size)
  }

  acquireLarge(): ArrayBuffer {
    const b = this._largeFree.pop()
    if (b !== undefined) return b
    this._largeExhausted++
    if (this._seeded && (this._largeExhausted & 15) === 1) {
      console.warn(`[devtools] large pool exhausted; allocating one-off. ${this._largeExhausted} events total`)
    }
    return new ArrayBuffer(POOL.large.size)
  }

  /**
   * Push a buffer back onto its tier's free stack. Buffers that don't
   * match either tier's size are orphaned (they were one-off fallback
   * allocations) — let GC reclaim them rather than contaminating the
   * pool with mismatched sizes.
   */
  release(buf: ArrayBuffer): void {
    const n = buf.byteLength
    if (n === POOL.small.size) {
      this._smallFree.push(buf)
      return
    }
    if (n === POOL.large.size) {
      this._largeFree.push(buf)
      return
    }
    this._orphaned++
  }

  stats(): PoolStats {
    return {
      smallFree: this._smallFree.length,
      largeFree: this._largeFree.length,
      smallExhausted: this._smallExhausted,
      largeExhausted: this._largeExhausted,
      orphaned: this._orphaned,
    }
  }

  dispose(): void {
    this._smallFree.length = 0
    this._largeFree.length = 0
  }
}

/** Allocate one tier's worth of fresh buffers — called by the worker at boot. */
export function allocateTier(tier: PoolTier): ArrayBuffer[] {
  const spec = POOL[tier]
  const out: ArrayBuffer[] = new Array(spec.count)
  for (let i = 0; i < spec.count; i++) out[i] = new ArrayBuffer(spec.size)
  return out
}

/**
 * Mutable cursor handed to `drain*` functions so they can append
 * their typed-array bytes into a shared pool buffer. Each `copyTypedTo`
 * call writes a TypedArray's contents at the current offset and
 * returns a new same-typed view positioned at that offset, then
 * advances the cursor (4-byte aligned for downstream views).
 */
export interface BufferCursor {
  buffer: ArrayBuffer
  byteOffset: number
}

/**
 * Copy `src`'s bytes into `cursor.buffer` at `cursor.byteOffset`,
 * return a same-typed view at that location, advance the cursor with
 * 4-byte alignment.
 *
 * After the producer transfers the buffer to the worker via
 * `postMessage(msg, [cursor.buffer])`, the returned view's underlying
 * ArrayBuffer is the worker's copy — `bc.postMessage(msg)`'s
 * structuredSerialize then copies the bytes into the BC delivery
 * queues for each subscriber.
 */
export function copyTypedTo<
  T extends Int8Array | Uint8Array | Int16Array | Uint16Array
       | Int32Array | Uint32Array | Float32Array | Float64Array,
>(cursor: BufferCursor, src: T): T {
  const len = src.length
  const byteLen = src.byteLength
  if (cursor.byteOffset + byteLen > cursor.buffer.byteLength) {
    throw new RangeError(
      `bus-pool cursor overflow: need ${byteLen}B at offset ${cursor.byteOffset} ` +
      `(buffer ${cursor.buffer.byteLength}B)`,
    )
  }
  const dstU8 = new Uint8Array(cursor.buffer, cursor.byteOffset, byteLen)
  const srcU8 = new Uint8Array(src.buffer, src.byteOffset, byteLen)
  dstU8.set(srcU8)
  const Ctor = src.constructor as new (b: ArrayBuffer, o: number, l: number) => T
  const view = new Ctor(cursor.buffer, cursor.byteOffset, len)
  // 4-byte align the cursor so the next typed-array view (up to
  // Float32) starts on a natural boundary.
  cursor.byteOffset = (cursor.byteOffset + byteLen + 3) & ~3
  return view
}
