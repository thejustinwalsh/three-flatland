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
 * No-op when devtools isn't bundled (gated via the devtools build
 * gate). Older Chromes silently ignore the `detail`
 * payload and the spans show up on the default Timings track.
 */

// Types the build-time `process.env` reads without requiring @types/node (shadows the global where present; erased at compile).
declare const process: { env: { NODE_ENV?: string; FL_DEVTOOLS?: string } }

const TRACK_GROUP = 'three-flatland'

/** Track names used across the codebase. Add new ones here as you go. */
export const PERF_TRACK = {
  Devtools: 'devtools',
  Lighting: 'lighting',
  Sprites: 'sprites',
  SDF: 'sdf',
  Schedule: 'schedule',
  Animation: 'animation',
  Batch: 'batch',
} as const

export type PerfTrackName = (typeof PERF_TRACK)[keyof typeof PERF_TRACK]

/**
 * Chrome devtools palette tokens accepted by the `detail.devtools`
 * extension. Keep these to the documented set — invalid values trigger
 * a console warning in DevTools.
 */
export type PerfColor =
  | 'primary'
  | 'primary-light'
  | 'primary-dark'
  | 'secondary'
  | 'secondary-light'
  | 'secondary-dark'
  | 'tertiary'
  | 'tertiary-light'
  | 'tertiary-dark'
  | 'warning'
  | 'error'

/**
 * Default color per track so the Performance panel is colour-coded and
 * scannable at a glance — each logical pipeline reads as its own hue.
 */
export const TRACK_COLOR: Record<PerfTrackName, PerfColor> = {
  [PERF_TRACK.Devtools]: 'warning',
  [PERF_TRACK.Lighting]: 'tertiary',
  [PERF_TRACK.SDF]: 'tertiary-dark',
  [PERF_TRACK.Sprites]: 'primary',
  [PERF_TRACK.Batch]: 'secondary',
  [PERF_TRACK.Animation]: 'primary-light',
  [PERF_TRACK.Schedule]: 'primary-dark',
}

/**
 * Optional track-entry annotations. `tooltipText` shows on hover;
 * `properties` render as a key/value table in the entry's details
 * drawer. See Chrome's "Extensibility API for the Performance panel".
 */
export interface PerfDetailOptions {
  /** Palette token; defaults to the track's {@link TRACK_COLOR}. */
  color?: PerfColor
  /** Hover text for the entry. */
  tooltipText?: string
  /** Key/value rows shown in the entry's details drawer. */
  properties?: [string, string][]
}

/**
 * Emit a span on `track`. Color defaults to the track's hue; pass
 * `opts` for a custom color, hover tooltip, or a properties table. Safe
 * to call from hot paths — capability check + try/catch keeps it from
 * ever throwing.
 */
export function perfMeasure(
  track: PerfTrackName,
  name: string,
  start: number,
  end: number,
  opts?: PerfDetailOptions
): void {
  // Dev-only: perf-track measurement is never emitted in a production build,
  // even when the devtools dashboard is force-enabled via FL_DEVTOOLS. The
  // Chrome Performance-panel instrumentation is a development aid; in prod it
  // would only add per-call overhead with no consumer.
  if (process.env.NODE_ENV === 'production') return
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return
  if (end < start) return
  try {
    const devtools: Record<string, unknown> = {
      dataType: 'track-entry',
      track,
      trackGroup: TRACK_GROUP,
      color: opts?.color ?? TRACK_COLOR[track],
    }
    if (opts?.tooltipText !== undefined) devtools['tooltipText'] = opts.tooltipText
    if (opts?.properties !== undefined) devtools['properties'] = opts.properties
    performance.measure(name, { start, end, detail: { devtools } })
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
 *
 * Part of the colored-perf-tracks instrumentation (#115): `perfMeasure`
 * is wired into `DevtoolsProvider`; broader pipeline coverage (and most
 * `perfStart` call sites) is tracked there.
 */
export function perfStart(track: PerfTrackName, name: string, opts?: PerfDetailOptions): () => void {
  const start = performance.now()
  return () => perfMeasure(track, name, start, performance.now(), opts)
}
