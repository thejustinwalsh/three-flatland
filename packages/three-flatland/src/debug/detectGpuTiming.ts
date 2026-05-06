/**
 * Decide whether the current renderer is actually capable of emitting
 * GPU timestamps — *not* just "the user asked for them via
 * `trackTimestamp: true`".
 *
 * This is the single source of truth for the `gpuModeEnabled` env flag
 * shipped to consumers AND for the producer's per-frame decision to
 * include a `gpuMs` ring in the stats payload. Mismatching those two
 * is what previously caused the regression: producer shipped a
 * forward-filled zero buffer while consumers happily rendered it.
 *
 * The probe is cheap (one string compare + a property access). Call it
 * every frame rather than caching — `trackTimestamp` flips during
 * three.js's `init()`, so any value cached before the device is ready
 * is stale.
 *
 * Backend-specific signals:
 *
 *   - WebGL2: three exposes the `EXT_disjoint_timer_query_webgl2`
 *     extension as `backend.disjoint`. Non-null = present.
 *   - WebGPU: after `init()`, three rewrites
 *     `backend.trackTimestamp = trackTimestamp && hasFeature('timestamp-query')`.
 *     We trust that as authoritative — but additionally probe the
 *     device's features when present so the answer is right *before*
 *     init lands too.
 */

export interface GpuTimingProbeBackend {
  trackTimestamp?: boolean
  constructor?: { name?: string }
  /** WebGL2: present iff `EXT_disjoint_timer_query_webgl2` was negotiated. */
  disjoint?: unknown
  /** WebGPU: the live `GPUDevice` once init has resolved. */
  device?: unknown
}

export function detectGpuTimingActive(
  backend: GpuTimingProbeBackend | undefined,
): boolean {
  if (!backend) return false
  if (backend.trackTimestamp !== true) return false
  const name = backend.constructor?.name
  if (name === 'WebGLBackend') {
    return backend.disjoint != null
  }
  // WebGPU. Once init() has run, three has already gated trackTimestamp
  // on adapter support, so the early return above is usually enough.
  // The features.has check covers the pre-init window where
  // trackTimestamp is still optimistic.
  const device = backend.device as
    | { features?: { has(name: string): boolean } }
    | undefined
  if (device?.features) {
    return device.features.has('timestamp-query')
  }
  // Device not ready yet: caller asked for tracking, three hasn't yet
  // had a chance to confirm or downgrade. Optimistic; stable as soon
  // as init() lands and the next probe fires.
  return true
}
