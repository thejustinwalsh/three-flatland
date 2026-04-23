/** @jsxImportSource preact */
/**
 * Stats strip — live sparkline per counter.
 *
 * Each card pairs a value label with a muted canvas sparkline drawn
 * behind the text. Palette matches the Tweakpane pane's retro theme
 * colors so switching between the two UIs stays visually coherent.
 *
 * The provider already keeps per-field rings in `DevtoolsState.series`;
 * this component just samples them on every state update and redraws
 * each canvas. Auto-ranged per series — a perfectly flat metric (e.g.
 * no draw-call churn) renders as a centered line rather than a
 * jittering zero.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import type { DevtoolsSeries, DevtoolsState } from '../../devtools-client.js'
import { useDevtoolsState } from '../hooks.js'

interface StatDef {
  label: string
  pick: (s: DevtoolsState) => number | undefined
  series: (s: DevtoolsState) => DevtoolsSeries
  format: (v: number | undefined) => string
  color: string
}

function fmt1(v: number | undefined): string {
  return v === undefined ? '—' : v.toFixed(1)
}
function fmt0(v: number | undefined): string {
  return v === undefined ? '—' : Math.round(v).toString()
}
function fmtMs(v: number | undefined): string {
  return v === undefined ? '—' : `${v.toFixed(1)}ms`
}
function fmtMB(v: number | undefined): string {
  return v === undefined ? '—' : `${v.toFixed(0)}MB`
}

const STATS: StatDef[] = [
  { label: 'fps',   pick: (s) => s.fps,        series: (s) => s.series.fps,        format: fmt0,  color: '#47cca9' },
  { label: 'cpu',   pick: (s) => s.cpuMs,      series: (s) => s.series.cpuMs,      format: fmtMs, color: '#47cc6a' },
  { label: 'gpu',   pick: (s) => s.gpuMs,      series: (s) => s.series.gpuMs,      format: fmtMs, color: '#ffa347' },
  { label: 'draws', pick: (s) => s.drawCalls,  series: (s) => s.series.drawCalls,  format: fmt0,  color: '#5eb0ff' },
  { label: 'tris',  pick: (s) => s.triangles,  series: (s) => s.series.triangles,  format: fmt0,  color: '#c792ea' },
  { label: 'prims', pick: (s) => s.primitives, series: (s) => s.series.primitives, format: fmt0,  color: '#ff8fa3' },
  { label: 'geos',  pick: (s) => s.geometries, series: (s) => s.series.geometries, format: fmt0,  color: '#f78c6c' },
  { label: 'tex',   pick: (s) => s.textures,   series: (s) => s.series.textures,   format: fmt0,  color: '#ffc371' },
  { label: 'heap',  pick: (s) => s.heapUsedMB, series: (s) => s.series.heapUsedMB, format: fmtMB, color: '#d94c87' },
]

export function StatsStrip() {
  const s = useDevtoolsState()
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const expandedDef = STATS.find((d) => d.label === expandedKey) ?? null
  return (
    <section class="panel">
      <header class="panel-header">Stats</header>
      <div class="stats-strip">
        {STATS.map((def) => (
          <StatCard
            key={def.label}
            def={def}
            state={s}
            selected={def.label === expandedKey}
            onSelect={() => setExpandedKey((k) => (k === def.label ? null : def.label))}
          />
        ))}
      </div>
      {expandedDef !== null && (
        <StatDetail
          def={expandedDef}
          state={s}
          onClose={() => setExpandedKey(null)}
        />
      )}
    </section>
  )
}

function StatCard({
  def,
  state,
  selected,
  onSelect,
}: {
  def: StatDef
  state: DevtoolsState
  selected: boolean
  onSelect: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Persistent per-card smoothed axis range — prevents the "peaks
  // jumping as it scrolls" effect that raw per-frame min/max
  // produces when a tall sample exits the visible window. Grows
  // instantly to match new peaks, decays slowly afterward (see
  // `drawSeries`'s RANGE_DECAY).
  const rangeRef = useRef<{ min: number; max: number } | null>(null)
  const value = def.pick(state)
  const series = def.series(state)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    drawSeries(ctx, canvas.width, canvas.height, series, def.color, rangeRef)
  })

  return (
    <button
      type="button"
      class={`stat${selected ? ' stat-selected' : ''}`}
      style={{ '--stat-color': def.color }}
      onClick={onSelect}
      title="Click for percentile distribution"
    >
      <canvas class="stat-canvas" ref={canvasRef} />
      <span class="stat-label">{def.label}</span>
      <span class="stat-value">{def.format(value)}</span>
    </button>
  )
}

function StatDetail({ def, state, onClose }: {
  def: StatDef
  state: DevtoolsState
  onClose: () => void
}) {
  const series = def.series(state)
  const stats = computeStats(series)
  const histoRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = histoRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    drawHistogram(ctx, canvas.width, canvas.height, series, def.color)
  })
  return (
    <div class="stat-detail" style={{ '--stat-color': def.color }}>
      <div class="stat-detail-header">
        <span class="stat-detail-label">{def.label}</span>
        <span class="stat-detail-samples">{stats.count} samples</span>
        <button type="button" class="stat-detail-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div class="stat-detail-metrics">
        <Metric label="min" value={def.format(stats.min)} />
        <Metric label="p50" value={def.format(stats.p50)} />
        <Metric label="mean" value={def.format(stats.mean)} />
        <Metric label="p95" value={def.format(stats.p95)} />
        <Metric label="p99" value={def.format(stats.p99)} />
        <Metric label="max" value={def.format(stats.max)} />
      </div>
      <canvas class="stat-histo" ref={histoRef} />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div class="stat-metric">
      <span class="stat-metric-label">{label}</span>
      <span class="stat-metric-value">{value}</span>
    </div>
  )
}

interface SeriesStats {
  count: number
  min: number | undefined
  max: number | undefined
  mean: number | undefined
  p50: number | undefined
  p95: number | undefined
  p99: number | undefined
}

function computeStats(series: DevtoolsSeries): SeriesStats {
  const len = series.length
  if (len === 0) return { count: 0, min: undefined, max: undefined, mean: undefined, p50: undefined, p95: undefined, p99: undefined }
  const size = series.data.length
  const start = (series.write - len + size) % size
  // Copy into a dense array for sorting — len is typically ~256 so
  // this allocation is negligible per expand.
  const arr = new Float64Array(len)
  let sum = 0
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < len; i++) {
    const v = series.data[(start + i) % size]!
    arr[i] = v
    sum += v
    if (v < min) min = v
    if (v > max) max = v
  }
  arr.sort()
  const pct = (p: number) => arr[Math.min(len - 1, Math.floor(p * len))]!
  return {
    count: len,
    min,
    max,
    mean: sum / len,
    p50: pct(0.5),
    p95: pct(0.95),
    p99: pct(0.99),
  }
}

function drawHistogram(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  series: DevtoolsSeries,
  color: string,
): void {
  ctx.clearRect(0, 0, w, h)
  const len = series.length
  if (len === 0) return
  const size = series.data.length
  const start = (series.write - len + size) % size
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < len; i++) {
    const v = series.data[(start + i) % size]!
    if (v < min) min = v
    if (v > max) max = v
  }
  const BINS = 32
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-6) {
    // Degenerate: every sample shares one value, no variance across
    // the value axis. Render as a thin full-width muted band rather
    // than a tall single bar — the band communicates "uniform" without
    // implying a distribution that isn't there.
    const bandH = Math.max(3, Math.round(h * 0.15))
    ctx.fillStyle = hexWithAlpha(color, 0.25)
    ctx.fillRect(0, h - bandH, w, bandH)
    return
  }
  const counts = new Uint32Array(BINS)
  const range = max - min
  for (let i = 0; i < len; i++) {
    const v = series.data[(start + i) % size]!
    const t = (v - min) / range
    const bin = Math.min(BINS - 1, Math.max(0, Math.floor(t * BINS)))
    counts[bin] = (counts[bin]! + 1) >>> 0
  }
  let peak = 0
  for (let i = 0; i < BINS; i++) if (counts[i]! > peak) peak = counts[i]!
  if (peak === 0) return
  const binW = w / BINS
  ctx.fillStyle = hexWithAlpha(color, 0.65)
  for (let i = 0; i < BINS; i++) {
    const ch = (counts[i]! / peak) * h * 0.85
    ctx.fillRect(i * binW + 1, h - ch, binW - 2, ch)
  }
}

/**
 * Axis hysteresis via power-of-two buckets.
 *
 * The earlier attempt used continuous exponential smoothing — grow
 * fast, decay slow. It hides scroll-out pops but introduces a new
 * problem: the axis is *always* drifting, so the same stable sample
 * value renders at a different height on every draw. Under a noisy
 * series like `gpuMs` the continuous drift reads as "the line
 * reshapes" — peaks get sharper or flatter even for frozen historic
 * data as it scrolls across the canvas.
 *
 * The bucket approach pins max to the next 2^n above the observed
 * value (1, 2, 4, 8, 16, 32, 64, …). The axis snaps cleanly between
 * discrete steps instead of drifting continuously; most of the time
 * max sits in the SAME bucket frame after frame, so renders are
 * pixel-stable. Shrink only when observed drops well below the
 * bucket (the `* 2.5` threshold) so we don't oscillate at bucket
 * boundaries.
 *
 * Min is anchored at 0. For ms / count metrics, 0 is the
 * meaningful floor; auto-smoothing the min just adds another
 * variable axis we don't need.
 */
function bucketUp(v: number): number {
  if (v <= 1) return 1
  return Math.pow(2, Math.ceil(Math.log2(v)))
}

/**
 * Draw a muted sparkline of the ring's samples. Uses a bucketed
 * power-of-two max with hysteresis (see `bucketUp` above) and an
 * anchored zero floor — the axis only snaps between discrete
 * `[0, 2^n]` scales, keeping render heights pixel-stable for stable
 * data. Flat series render as a centered line.
 */
function drawSeries(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  series: DevtoolsSeries,
  color: string,
  rangeRef: { current: { min: number; max: number } | null },
): void {
  ctx.clearRect(0, 0, w, h)
  const len = series.length
  const size = series.data.length
  if (len === 0 || size === 0) return

  let observedMax = 0
  // Walk the last `len` samples, oldest → newest, so the sparkline
  // reads left-to-right. `series.write` is the next-to-write slot, so
  // the oldest valid sample is at `(write - len + size) % size`.
  const start = (series.write - len + size) % size
  for (let i = 0; i < len; i++) {
    const v = series.data[(start + i) % size]!
    if (v > observedMax) observedMax = v
  }
  if (!Number.isFinite(observedMax)) return

  // Bucket the max to next 2^n with hysteresis.
  if (rangeRef.current === null) {
    rangeRef.current = { min: 0, max: bucketUp(observedMax) }
  } else {
    const r = rangeRef.current
    if (observedMax > r.max) {
      r.max = bucketUp(observedMax)
    } else if (observedMax * 2.5 < r.max && r.max > 1) {
      // Observed is well under half the current bucket — shrink.
      r.max = bucketUp(observedMax)
    }
    // else: stay in the current bucket — no axis motion.
  }
  const { min, max } = rangeRef.current

  // Flat line when range is trivial — render at center.
  const range = max - min
  const useCenter = range < 1e-6

  // Translucent fill under the line so it reads as a muted band.
  // Anchor the fill polygon at the bottom-left regardless of where the
  // first sample lands — without this the leading edge floats up/down
  // with the first value, making the fill shape jitter per frame.
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let i = 0; i < len; i++) {
    const v = series.data[(start + i) % size]!
    const x = (i / Math.max(1, len - 1)) * w
    const y = useCenter
      ? h * 0.5
      : h - ((v - min) / range) * (h * 0.85) - h * 0.075
    ctx.lineTo(x, y)
  }
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fillStyle = hexWithAlpha(color, 0.18)
  ctx.fill()

  // Crisp line on top.
  ctx.beginPath()
  for (let i = 0; i < len; i++) {
    const v = series.data[(start + i) % size]!
    const x = (i / Math.max(1, len - 1)) * w
    const y = useCenter
      ? h * 0.5
      : h - ((v - min) / range) * (h * 0.85) - h * 0.075
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = hexWithAlpha(color, 0.65)
  ctx.lineWidth = Math.max(1, Math.round(window.devicePixelRatio || 1))
  ctx.stroke()
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (m === null) return hex
  const r = parseInt(m[1]!.slice(0, 2), 16)
  const g = parseInt(m[1]!.slice(2, 4), 16)
  const b = parseInt(m[1]!.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
