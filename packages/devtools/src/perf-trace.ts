/**
 * Log inbound bus messages as User Timing spans so they render on
 * Chrome DevTools' **Performance → Timings** track. Each span covers
 * the window from when the sender stamped the message to when the
 * handler received it — effectively end-to-end `BroadcastChannel`
 * delivery latency.
 *
 * Usage: call `tracePerf(msg)` at the top of the receive handler
 * (both the discovery and data routers). Safe in non-performance
 * environments — every call is wrapped in a capability check and a
 * try/catch so a failed measurement never takes down the client.
 *
 * Name scheme: `bus:<type>` (e.g. `bus:data`, `bus:ping`,
 * `bus:subscribe:ack`). Chrome groups measures by name, so you can
 * filter / pivot per type in the track inspector.
 */
export function tracePerf(msg: { ts: number; type: string } | undefined): void {
  if (msg === undefined) return
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return
  const ts = msg.ts
  if (typeof ts !== 'number' || ts <= 0) return
  try {
    // `msg.ts` is `Date.now()` (wall clock). Convert to the `performance.now()`
    // origin by subtracting `timeOrigin`. When the clocks disagree slightly
    // (they can, by a handful of ms) the span may end before it starts —
    // clamp so we never emit a negative-duration measure.
    const start = ts - performance.timeOrigin
    const end = performance.now()
    if (end < start) return
    performance.measure(`bus:${msg.type}`, { start, end })
  } catch {
    // DevTools may reject malformed measures in older Chromes; ignore.
  }
}
