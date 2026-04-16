/**
 * Bus offload worker.
 *
 * Owns the pool allocation and the per-provider `BroadcastChannel` so
 * the producer's render thread never pays for `structuredClone` of
 * typed arrays (BC's serialise step). Boot sequence:
 *
 *   1. Producer constructs the worker with `new Worker(...)`.
 *   2. Producer sends `{ type: '__init__', channelName }`.
 *   3. Worker creates the BroadcastChannel, allocates both pool
 *      tiers, and transfers every buffer back to the producer in two
 *      `__pool_init__` messages.
 *
 * Steady-state per flush:
 *
 *   • Producer: pop a pool buffer, memcpy ring snapshot into it,
 *     construct a `DebugMessage` whose typed-array fields are views
 *     over the pool buffer, `worker.postMessage(msg, [poolBuf])` —
 *     transfers the buffer to the worker (zero-copy on this hop).
 *   • Worker: receives `msg`. The transferred buffer is now owned by
 *     the worker; the typed-array views inside `msg` reference it.
 *     `bc.postMessage(msg)` runs `StructuredSerialize` synchronously
 *     (per HTML spec §16.3.4), copying the typed-array bytes into the
 *     delivery queue for each subscriber. After `bc.postMessage`
 *     returns, the buffer's contents are no longer needed for
 *     delivery, so the worker `postMessage(buf, [buf])`s it back to
 *     the producer's pool.
 *
 * Convention: any DebugMessage that wants buffers bounced back tags
 * itself with `__poolBufs: ArrayBuffer[]`. The worker peels that
 * field off before broadcasting (so consumers don't see it) and
 * transfers each buffer back. Lifecycle messages (no typed arrays)
 * skip the field entirely and stay on a regular structuredClone path.
 */

import { allocateTier } from './bus-pool'

interface InitMessage {
  type: '__init__'
  channelName: string
}

interface BounceTag {
  /** Buffers to transfer back to the producer's pool after broadcast. */
  __poolBufs?: ArrayBuffer[]
}

let bc: BroadcastChannel | null = null

/**
 * Minimal worker-scope shape we need. Avoids pulling in the full
 * `WebWorker` lib in the package's tsconfig (which would conflict
 * with `DOM` since they overlap names like `MessageEvent`).
 */
interface WorkerScope {
  onmessage: ((ev: MessageEvent<unknown>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}
const ctx = self as unknown as WorkerScope

ctx.onmessage = (ev: MessageEvent<unknown>) => {
  const msg = ev.data as InitMessage | (Record<string, unknown> & BounceTag) | undefined
  if (msg === undefined) return

  // Init handshake — set up the BroadcastChannel, allocate the pool,
  // transfer it back to the producer.
  if (msg && (msg as InitMessage).type === '__init__') {
    const init = msg as InitMessage
    if (bc !== null) {
      try { bc.close() } catch { /* swallow */ }
    }
    bc = new BroadcastChannel(init.channelName)

    const small = allocateTier('small')
    ctx.postMessage({ type: '__pool_init__', tier: 'small', bufs: small }, small)

    const large = allocateTier('large')
    ctx.postMessage({ type: '__pool_init__', tier: 'large', bufs: large }, large)
    return
  }

  if (bc === null) return // not yet initialised; drop

  // Regular forwardable message. Pull off any pool buffers we need to
  // bounce back, then broadcast the rest.
  const tagged = msg as Record<string, unknown> & BounceTag
  const poolBufs = tagged.__poolBufs
  if (poolBufs !== undefined) {
    delete tagged.__poolBufs
  }

  try {
    bc.postMessage(tagged)
  } catch {
    // BC may be closed during teardown — swallow.
  }

  // After bc.postMessage returns, structuredSerialize has copied the
  // payload bytes into the BC delivery queues; the original pool
  // buffer's contents are no longer needed. Bounce each buffer back
  // to the producer via transfer.
  if (poolBufs !== undefined) {
    for (const buf of poolBufs) {
      ctx.postMessage({ type: '__release__', buf }, [buf])
    }
  }
}
