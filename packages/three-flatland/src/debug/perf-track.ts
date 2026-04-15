/**
 * Per-system timing helper. Wraps `performance.measure` with the
 * Chrome 129+ `detail.devtools` extension so spans land on a named
 * track in the Performance panel grouped under `three-flatland`.
 *
 * Convention:
 *   - **Track group**: `three-flatland` (the library — parent of every
 *     instrumented subsystem).
 *   - **Track**: the subsystem the span belongs to (`Devtools`,
 *     `Lighting`, `Sprites`, `SDF`, …). One track per logical pipeline.
 *   - **Entry name**: a `category:detail` slug used to group like-spans
 *     within a track (`bus:data`, `flush`, `pass:occlusion`).
 *
 * No-op when devtools isn't bundled (build-time gated via
 * `DEVTOOLS_BUNDLED`). Older Chromes silently ignore the `detail`
 * payload and the spans show up on the default Timings track.
 */

import { DEVTOOLS_BUNDLED } from '../debug-protocol'

const TRACK_GROUP = 'three-flatland'

/** Track names used across the codebase. Add new ones here as you go. */
export const PERF_TRACK = {
  Devtools: 'devtools',
  Lighting: 'lighting',
  Sprites: 'sprites',
  SDF: 'sdf',
} as const

export type PerfTrackName = (typeof PERF_TRACK)[keyof typeof PERF_TRACK]

/**
 * Chrome devtools palette tokens accepted by the `detail.devtools`
 * extension. Keep these to the documented set — invalid values trigger
 * a console warning in DevTools.
 */
export type PerfColor =
  | 'primary' | 'primary-light' | 'primary-dark'
  | 'secondary' | 'secondary-light' | 'secondary-dark'
  | 'tertiary' | 'tertiary-light' | 'tertiary-dark'
  | 'warning' | 'error'

/**
 * Emit a span on `track`. Pass either a `start`/`end` pair (use
 * `performance.now()` at both ends) or a `start` and `duration`. Safe
 * to call from hot paths — capability check + try/catch keeps it from
 * ever throwing.
 */
export function perfMeasure(
  track: PerfTrackName,
  name: string,
  start: number,
  end: number,
  color: PerfColor = 'primary',
): void {
  if (!DEVTOOLS_BUNDLED) return
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return
  if (end < start) return
  try {
    performance.measure(name, {
      start,
      end,
      detail: {
        devtools: {
          dataType: 'track-entry',
          track,
          trackGroup: TRACK_GROUP,
          color,
        },
      },
    })
  } catch {
    // Older Chromes reject the `detail.devtools` payload; ignore.
  }
}

/**
 * Convenience: open a perf-measure scope and return a function that
 * closes it. Pattern:
 *
 * ```ts
 * const end = perfStart('Devtools', 'flush')
 * doWork()
 * end()
 * ```
 *
 * Allocates the closure once per call — fine for occasional use; for
 * tight per-frame paths, prefer `perfMeasure` with manual timestamps
 * to avoid the closure cost.
 */
export function perfStart(
  track: PerfTrackName,
  name: string,
  color: PerfColor = 'primary',
): () => void {
  const start = performance.now()
  return () => perfMeasure(track, name, start, performance.now(), color)
}
