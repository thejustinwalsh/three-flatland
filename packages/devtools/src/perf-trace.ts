/**
 * Log inbound bus messages as User Timing spans on the shared
 * **Devtools** track under the **three-flatland** group in Chrome's
 * Performance panel. Each span covers the window from when the sender
 * stamped the message to when the handler received it — end-to-end
 * `BroadcastChannel` delivery latency.
 *
 * Convention matches `packages/three-flatland/src/debug/perf-track.ts`:
 *   - track group: `three-flatland`
 *   - track:       `Devtools`
 *   - entry name:  `bus:<type>` (`bus:data`, `bus:ping`, `bus:subscribe:ack`, …)
 *
 * Older Chromes silently ignore the `detail.devtools` payload and the
 * spans show up on the default Timings track instead.
 *
 * Usage: call `tracePerf(msg)` at the top of the receive handler
 * (both the discovery and data routers). Safe in non-performance
 * environments — every call is wrapped in a capability check and a
 * try/catch so a failed measurement never takes down the client.
 */

const TRACK_NAME = 'devtools'
const TRACK_GROUP = 'three-flatland'

const COLOR_BY_TYPE: Record<string, string> = {
  data: 'primary',
  ping: 'secondary-light',
  'subscribe:ack': 'tertiary',
  subscribe: 'tertiary-light',
  ack: 'secondary',
  unsubscribe: 'tertiary-dark',
  'provider:announce': 'primary-light',
  'provider:query': 'primary-light',
  'provider:gone': 'error',
}

export function tracePerf(msg: { ts: number; type: string; payload?: unknown } | undefined): void {
  if (msg === undefined) return
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return
  const ts = msg.ts
  if (typeof ts !== 'number' || ts <= 0) return
  try {
    // `msg.ts` is `Date.now()` (wall clock). Convert to the
    // `performance.now()` origin by subtracting `timeOrigin`. Skip if
    // clocks disagree enough to make the span go backwards.
    const start = ts - performance.timeOrigin
    const end = performance.now()
    if (end < start) return

    // Compute the heavy-data byte count from the message we just got.
    // Walks typed-array fields only (ignoring object/scalar overhead,
    // which is dominated by the typed arrays for `data` packets).
    const bytes = estimatePayloadBytes(msg.payload)

    performance.measure(`bus:${msg.type}`, {
      start,
      end,
      detail: {
        devtools: {
          dataType: 'track-entry',
          track: TRACK_NAME,
          trackGroup: TRACK_GROUP,
          color: COLOR_BY_TYPE[msg.type] ?? 'primary',
          // Chrome's User Timings extension surfaces `properties` as a
          // key/value table in the entry detail panel — perfect for
          // per-message bandwidth at-a-glance.
          properties: bytes > 0
            ? [
                ['type', msg.type],
                ['bytes', formatBytes(bytes)],
              ]
            : [['type', msg.type]],
        },
      },
    })
  } catch {
    // DevTools may reject the extension payload in older Chromes;
    // ignore.
  }
}

/**
 * Walk a structured-cloned payload and sum the `byteLength` of every
 * typed array we encounter (one level deep into `features.*` for data
 * packets, one level into `entries[*]` for registry/buffers payloads).
 * Doesn't recurse into arbitrary nested objects — anything past these
 * known shapes contributes 0, which is fine because real bandwidth
 * lives in the typed arrays.
 */
function estimatePayloadBytes(payload: unknown): number {
  if (payload === null || typeof payload !== 'object') return 0
  let total = 0
  // Direct `features` shape on data packets.
  const features = (payload as { features?: Record<string, unknown> }).features
  if (features !== undefined) {
    for (const f of Object.values(features)) {
      total += sumTypedArrays(f)
    }
  }
  return total
}

function sumTypedArrays(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0
  let total = 0
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object' && (v as { byteLength?: number }).byteLength !== undefined && ArrayBuffer.isView(v as ArrayBufferView)) {
      total += (v as ArrayBufferView).byteLength
      continue
    }
    if (v && typeof v === 'object') {
      total += sumTypedArrays(v)
    }
  }
  return total
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}
