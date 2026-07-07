/**
 * Protocol-store ingest (#29 Phase C review fix).
 *
 * The ONE place raw bus messages get persisted into the `ProtocolStore`.
 * Wired unconditionally at dashboard bootstrap (`hooks.ts`'s
 * `ensureSourcesWired`) — NOT from any individual panel's effect.
 *
 * This used to live inside the Protocol Log panel's own raw-message
 * effect, gated on that panel's local `paused` state. That accidentally
 * made the entire flight recorder's history depend on the Protocol Log
 * panel happening to be mounted and un-paused: the scrubber, the buffer
 * flight ring, and registry checkpoint reconstruction all read this same
 * persisted history, so a user reaching for "Pause" to freeze their own
 * reading view was silently starving every other panel's time-travel
 * data too. Persistence is the flight recorder's whole premise — it
 * can't be an implicit side effect of one panel's display toggle.
 *
 * The Protocol Log panel keeps its own raw-message listener for
 * display bookkeeping (the tail-scroll bump count), still gated by its
 * `paused` toggle — that's a display concern, scoped to that panel,
 * and is unrelated to whether history gets recorded.
 */
import type { DebugMessage } from 'three-flatland/debug-protocol'
import type { RawMessageListener } from '../devtools-client.js'
import type { ProtocolStore } from './protocol-store.js'

/** Minimal shape `wireProtocolIngest` needs — satisfied structurally by `DevtoolsClient`. */
export interface IngestClient {
  readonly state: { selectedProviderId: string | null }
  addRawMessageListener(cb: RawMessageListener): () => void
}

/** Best-effort human tag for a log row — feature list for `data` packets, `name` for RPC-ish payloads. */
export function extractTag(msg: DebugMessage): string | undefined {
  if (msg.type === 'data') {
    const features = (msg as unknown as { payload?: { features?: Record<string, unknown> } }).payload?.features
    if (features !== undefined) {
      const keys = Object.keys(features).filter((k) => features[k] != null)
      return keys.length > 0 ? keys.join(',') : 'empty'
    }
  }
  const p = (msg as unknown as { payload?: { name?: string } }).payload
  if (p !== undefined && typeof p === 'object' && typeof p.name === 'string') return p.name
  return undefined
}

/** Engine frame carried by a message's payload, if any. */
export function extractFrame(msg: DebugMessage): number | undefined {
  const f = (msg as unknown as { payload?: { frame?: number } }).payload?.frame
  return typeof f === 'number' ? f : undefined
}

/** Cheap recursive byte-size estimate for a message — a UI-facing approximation, not a structured-clone audit. */
export function estimateBytes(msg: DebugMessage): number {
  let bytes = 0
  const seen = new WeakSet<object>()
  const walk = (v: unknown): void => {
    if (v === null || v === undefined) return
    if (typeof v === 'string') { bytes += v.length; return }
    if (typeof v === 'number' || typeof v === 'boolean') { bytes += 8; return }
    if (v instanceof ArrayBuffer) { bytes += v.byteLength; return }
    if (ArrayBuffer.isView(v)) { bytes += v.byteLength; return }
    if (typeof v === 'object') {
      if (seen.has(v)) return
      seen.add(v)
      if (Array.isArray(v)) { for (const x of v) walk(x); return }
      for (const k in v as Record<string, unknown>) {
        bytes += k.length
        walk((v as Record<string, unknown>)[k])
      }
    }
  }
  walk(msg)
  return bytes
}

/**
 * Wire the store to record every message the client sees — no pause,
 * no panel-mount dependency, no filter. Returns an unsubscribe. Callers
 * call this exactly once, at bootstrap; it is not meant to be called
 * per-panel.
 */
export function wireProtocolIngest(client: IngestClient, store: ProtocolStore): () => void {
  return client.addRawMessageListener((msg, direction) => {
    const providerId = client.state.selectedProviderId
    if (providerId === null) return
    store.push(providerId, {
      at: Date.now(),
      direction,
      type: msg.type,
      tag: extractTag(msg),
      frame: extractFrame(msg),
      bytes: estimateBytes(msg),
      msg,
    })
  })
}
