/**
 * Producer-side transport abstraction over the data-channel
 * `BroadcastChannel`.
 *
 * Two implementations:
 *
 *   - `WorkerBusTransport` — spawns `bus-worker.ts`, holds the
 *     per-provider buffer pool, transfers heavy `data` packets through
 *     the worker so the BC `structuredClone` doesn't run on the
 *     render thread. Targets ~zero render-thread allocations in
 *     steady state.
 *
 *   - `InlineBusTransport` — falls back to direct `BroadcastChannel`
 *     posts on the producer thread when the worker can't be spawned
 *     (no bundler resolving `new URL()`, restrictive CSP, etc.).
 *     Same observable behaviour as the legacy code path; just slower.
 *
 * Both surface the same minimal API:
 *
 *   acquireSmall()  → ArrayBuffer (empty, sized to small tier)
 *   acquireLarge()  → ArrayBuffer (empty, sized to large tier)
 *   post(msg, bufs?) — broadcast a DebugMessage; `bufs` are the pool
 *                      buffers the worker should bounce back after
 *                      broadcast (Worker impl only; no-op in Inline).
 *   dispose()
 *
 * The receive side (consumers) listens on the same BroadcastChannel
 * exactly as today — no transport-level change needed there. Only
 * the producer's hot path benefits from the worker offload.
 */

import type { DebugMessage } from '../debug-protocol'
import { BufferPool, POOL, allocateTier } from './bus-pool'

export interface BusTransport {
  /** Pop a small (4 KB) pool buffer. */
  acquireSmall(): ArrayBuffer
  /** Pop a large (256 KB) pool buffer. */
  acquireLarge(): ArrayBuffer
  /**
   * Broadcast a message. Pass any pool buffers referenced by typed
   * arrays inside `msg` in `bufs` so the transport can route them
   * back to the pool after the BroadcastChannel serialise step. In
   * `InlineBusTransport`, `bufs` is ignored — we don't pool
   * allocations on the slow path.
   */
  post(msg: DebugMessage, bufs?: ArrayBuffer[]): void
  /**
   * Return a buffer to the pool without sending it. Use when an
   * `acquire*` happened but the flush turned out to have nothing to
   * ship — avoids pool starvation. No-op for the inline transport
   * (its buffers GC themselves).
   */
  releaseUnused(buf: ArrayBuffer): void
  /** Approximate count of buffers currently held in each pool tier. */
  poolStats(): { smallFree: number; largeFree: number }
  dispose(): void
}

/* ─────────────────────────── Worker impl ──────────────────────────── */

interface PoolInitMessage {
  type: '__pool_init__'
  tier: 'small' | 'large'
  bufs: ArrayBuffer[]
}

interface PoolReleaseMessage {
  type: '__release__'
  buf: ArrayBuffer
}

class WorkerBusTransport implements BusTransport {
  private _worker: Worker
  private _pool = new BufferPool()
  private _disposed = false

  constructor(channelName: string, worker: Worker) {
    this._worker = worker
    this._worker.addEventListener('message', (ev) => {
      const msg = ev.data as PoolInitMessage | PoolReleaseMessage | undefined
      if (msg === undefined) return
      if (msg.type === '__pool_init__') {
        this._pool.seed(msg.tier, msg.bufs)
      } else if (msg.type === '__release__') {
        this._pool.release(msg.buf)
      }
    })
    this._worker.postMessage({ type: '__init__', channelName })
  }

  acquireSmall(): ArrayBuffer { return this._pool.acquireSmall() }
  acquireLarge(): ArrayBuffer { return this._pool.acquireLarge() }

  post(msg: DebugMessage, bufs?: ArrayBuffer[]): void {
    if (this._disposed) return
    if (bufs !== undefined && bufs.length > 0) {
      // Tag the message so the worker knows which buffers to bounce.
      ;(msg as DebugMessage & { __poolBufs?: ArrayBuffer[] }).__poolBufs = bufs
      try {
        this._worker.postMessage(msg, bufs)
      } catch {
        // Worker may be terminating; let the next post fail loudly.
      }
    } else {
      try {
        this._worker.postMessage(msg)
      } catch { /* swallow */ }
    }
  }

  releaseUnused(buf: ArrayBuffer): void {
    this._pool.release(buf)
  }

  poolStats(): { smallFree: number; largeFree: number } {
    const s = this._pool.stats()
    return { smallFree: s.smallFree, largeFree: s.largeFree }
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    try { this._worker.terminate() } catch { /* swallow */ }
    this._pool.dispose()
  }
}

/* ─────────────────────────── Inline impl ──────────────────────────── */

/**
 * Fallback that posts directly on the producer thread. Pool methods
 * still allocate (no actual pool — every `acquire` returns a fresh
 * ArrayBuffer) so callers can use the same code path; the buffers
 * just go straight to GC after the post (BC structuredClones the
 * typed arrays anyway).
 */
class InlineBusTransport implements BusTransport {
  private _bc: BroadcastChannel
  private _disposed = false

  constructor(channelName: string) {
    this._bc = new BroadcastChannel(channelName)
  }

  acquireSmall(): ArrayBuffer { return new ArrayBuffer(POOL.small.size) }
  acquireLarge(): ArrayBuffer { return new ArrayBuffer(POOL.large.size) }

  post(msg: DebugMessage, _bufs?: ArrayBuffer[]): void {
    if (this._disposed) return
    try { this._bc.postMessage(msg) } catch { /* swallow */ }
  }

  releaseUnused(_buf: ArrayBuffer): void { /* no pool to return to */ }

  poolStats(): { smallFree: number; largeFree: number } {
    return { smallFree: 0, largeFree: 0 }
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    try { this._bc.close() } catch { /* swallow */ }
  }
}

/* ─────────────────────────── Factory ──────────────────────────── */

export interface CreateBusTransportOptions {
  channelName: string
  /**
   * Override for the worker spawn — useful for tests or for hosts
   * that want to provide a pre-built `Worker` instance. When omitted,
   * we attempt the canonical `new Worker(new URL('./bus-worker.ts',
   * import.meta.url), { type: 'module' })` and fall back to the
   * inline transport if that throws.
   */
  spawnWorker?: () => Worker | null
  /**
   * Force the inline path (skip the worker even if it's available).
   * Useful as a kill switch.
   */
  forceInline?: boolean
}

/**
 * Pick the best available transport. Tries the worker; on any
 * failure (CSP, no bundler, etc.) returns the inline fallback. We
 * deliberately do not await a handshake here — the worker init is
 * fire-and-forget and the pool seed messages will arrive on the
 * worker's own schedule. Until they do, `acquireSmall`/`acquireLarge`
 * fall back to one-off allocations and the warn counter ticks up.
 */
export function createBusTransport(opts: CreateBusTransportOptions): BusTransport {
  const { channelName, spawnWorker, forceInline } = opts
  if (forceInline) return new InlineBusTransport(channelName)

  if (typeof Worker === 'undefined') {
    return new InlineBusTransport(channelName)
  }

  let worker: Worker | null = null
  try {
    if (spawnWorker !== undefined) {
      worker = spawnWorker()
    } else {
      // The canonical Vite/webpack worker URL pattern. Bundlers see
      // the new URL(import.meta.url) call and emit the worker as a
      // separate chunk. Plain ESM hosts may resolve this too if the
      // worker file is served at the right path.
      worker = new Worker(new URL('./bus-worker.ts', import.meta.url), { type: 'module' })
    }
  } catch {
    worker = null
  }

  if (worker === null) {
    return new InlineBusTransport(channelName)
  }

  return new WorkerBusTransport(channelName, worker)
}
