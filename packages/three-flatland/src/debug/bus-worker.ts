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
 *
 * ## Pixel conversion + optional WebCodecs encoding
 *
 * When the producer sends `{ type: '__convert__', ... }`, the worker
 * converts the raw pixels to RGBA8 (via `convertToRGBA8`). If
 * `stream` is true and WebCodecs is available, the RGBA8 is fed to a
 * VP9 `VideoEncoder` and the encoded chunk is broadcast as
 * `buffer:chunk`. Otherwise the RGBA8 is broadcast as `buffer:raw`
 * for direct display. The raw pixel buffer is bounced back immediately
 * after conversion (the converter allocates its own output).
 */

import { allocateTier } from './bus-pool'
import { convertToRGBA8 } from './pixel-convert'

// ─── Types ────────────────────────────────────────────────────────────────

interface InitMessage {
  type: '__init__'
  channelName: string
}

interface ConvertMessage {
  type: '__convert__'
  name: string
  width: number
  height: number
  pixelType: string
  display: string
  frame: number
  stream: boolean
  pixels: ArrayBuffer
  pixelsByteLength: number
  __poolBufs?: ArrayBuffer[]
}

interface BounceTag {
  __poolBufs?: ArrayBuffer[]
}

// ─── Worker scope ─────────────────────────────────────────────────────────

interface WorkerScope {
  onmessage: ((ev: MessageEvent<unknown>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}
const ctx = self as unknown as WorkerScope

// ─── Stream encoder ───────────────────────────────────────────────────────

const VP9_CODEC = 'vp09.00.10.08'
const KEYFRAME_INTERVAL_MS = 2000
const DEFAULT_QUANTIZER = 30

class StreamEncoder {
  private _encoder: VideoEncoder | null = null
  private _bc: BroadcastChannel
  private _width = 0
  private _height = 0
  private _lastKeyFrameAt = 0
  private _pendingMeta: Map<number, {
    name: string; frame: number; capturedAt: number
    width: number; height: number; pixelType: string; display: string
  }> = new Map()
  private _tsCounter = 0

  constructor(bc: BroadcastChannel) {
    this._bc = bc
  }

  /**
   * Encode already-converted RGBA8 pixels into a VP9 video stream.
   * Conversion from the source pixel format happens before this call.
   */
  encode(rgba8: Uint8Array, meta: {
    name: string; frame: number; width: number; height: number
    pixelType: string; display: string
  }): void {
    const needsReconfigure = meta.width !== this._width || meta.height !== this._height

    if (needsReconfigure || this._encoder === null) {
      this._configure(meta.width, meta.height)
    }

    const encoder = this._encoder
    if (encoder === null) return

    const timestamp = this._tsCounter++
    const forceKey = needsReconfigure ||
      Date.now() - this._lastKeyFrameAt > KEYFRAME_INTERVAL_MS

    this._pendingMeta.set(timestamp, {
      name: meta.name,
      frame: meta.frame,
      capturedAt: performance.now(),
      width: meta.width,
      height: meta.height,
      pixelType: meta.pixelType,
      display: meta.display,
    })

    const frame = new VideoFrame(rgba8, {
      format: 'RGBA',
      codedWidth: meta.width,
      codedHeight: meta.height,
      timestamp,
    })
    encoder.encode(frame, { keyFrame: forceKey })
    frame.close()

    if (forceKey) this._lastKeyFrameAt = Date.now()
  }

  close(): void {
    if (this._encoder !== null && this._encoder.state !== 'closed') {
      try { this._encoder.close() } catch { /* may already be errored */ }
    }
    this._encoder = null
    this._pendingMeta.clear()
    this._width = 0
    this._height = 0
  }

  private _configure(width: number, height: number): void {
    this.close()
    this._width = width
    this._height = height

    const encoder = new VideoEncoder({
      output: (chunk) => this._onChunk(chunk),
      error: (e) => {
        console.warn('[bus-worker] VideoEncoder error:', e)
        this.close()
      },
    })

    encoder.configure({
      codec: VP9_CODEC,
      width,
      height,
      framerate: 4,
      latencyMode: 'realtime',
      bitrateMode: 'quantizer',
    } as VideoEncoderConfig)

    this._encoder = encoder
  }

  private _onChunk(chunk: EncodedVideoChunk): void {
    const meta = this._pendingMeta.get(chunk.timestamp)
    if (!meta) return
    this._pendingMeta.delete(chunk.timestamp)

    const data = new ArrayBuffer(chunk.byteLength)
    chunk.copyTo(data)

    const msg = {
      v: 1 as const,
      ts: Date.now(),
      type: 'buffer:chunk' as const,
      payload: {
        name: meta.name,
        frame: meta.frame,
        capturedAt: meta.capturedAt,
        width: meta.width,
        height: meta.height,
        pixelType: meta.pixelType,
        display: meta.display,
        keyFrame: chunk.type === 'key',
        codec: VP9_CODEC,
        data,
      },
    }

    try {
      this._bc.postMessage(msg)
    } catch {
      // BC may be closed during teardown.
    }
  }
}

// ─── State ────────────────────────────────────────────────────────────────

let bc: BroadcastChannel | null = null
let encoder: StreamEncoder | null = null
let codecSupported: boolean | null = null

async function probeCodecSupport(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false
  try {
    const result = await VideoEncoder.isConfigSupported({
      codec: VP9_CODEC,
      width: 256,
      height: 256,
      framerate: 4,
      latencyMode: 'realtime',
      bitrateMode: 'quantizer',
    } as VideoEncoderConfig)
    return result.supported === true
  } catch {
    return false
  }
}

// ─── Message handler ──────────────────────────────────────────────────────

ctx.onmessage = (ev: MessageEvent<unknown>) => {
  const msg = ev.data as InitMessage | ConvertMessage | (Record<string, unknown> & BounceTag) | undefined
  if (msg === undefined) return

  // Init handshake — set up the BroadcastChannel, allocate the pool,
  // transfer it back to the producer.
  if (msg && (msg as InitMessage).type === '__init__') {
    const init = msg as InitMessage
    if (encoder !== null) encoder.close()
    if (bc !== null) {
      try { bc.close() } catch { /* swallow */ }
    }
    bc = new BroadcastChannel(init.channelName)
    encoder = new StreamEncoder(bc)

    const small = allocateTier('small')
    ctx.postMessage({ type: '__pool_init__', tier: 'small', bufs: small }, small)

    const large = allocateTier('large')
    ctx.postMessage({ type: '__pool_init__', tier: 'large', bufs: large }, large)

    // Probe codec support and report back to producer
    void probeCodecSupport().then((supported) => {
      codecSupported = supported
      ctx.postMessage({ type: '__codec_support__', vp9: supported })
    })
    return
  }

  if (bc === null) return

  // Pixel conversion request — converts raw pixels to RGBA8, then
  // either feeds to the VP9 stream encoder or broadcasts as buffer:raw.
  if (msg && (msg as ConvertMessage).type === '__convert__') {
    const conv = msg as ConvertMessage

    // Convert BEFORE bouncing the pool buffer — conv.pixels IS the
    // pool buffer. Transferring it back detaches it from our scope.
    const rgba8 = convertToRGBA8(conv.pixels, conv.pixelType, conv.display, conv.width, conv.height, conv.pixelsByteLength)

    // Now bounce pool buffers back (conversion is done).
    const poolBufs = conv.__poolBufs
    if (poolBufs !== undefined) {
      delete conv.__poolBufs
      for (const buf of poolBufs) {
        ctx.postMessage({ type: '__release__', buf }, [buf])
      }
    }

    if (conv.stream && codecSupported && encoder !== null) {
      // Stream mode: feed RGBA8 to VP9 encoder
      encoder.encode(rgba8, {
        name: conv.name,
        frame: conv.frame,
        width: conv.width,
        height: conv.height,
        pixelType: conv.pixelType,
        display: conv.display,
      })
    } else {
      // Non-stream mode: broadcast as buffer:raw
      const rawMsg = {
        v: 1 as const,
        ts: Date.now(),
        type: 'buffer:raw' as const,
        payload: {
          name: conv.name,
          frame: conv.frame,
          width: conv.width,
          height: conv.height,
          data: rgba8.buffer,
        },
      }
      try {
        bc.postMessage(rawMsg)
      } catch {
        // BC may be closed during teardown.
      }
    }
    return
  }

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
