/** @jsxImportSource preact */
/**
 * Registry panel — CPU-array inspection with per-kind visualizers.
 *
 * Mirrors the Tweakpane pane's visualizer set so the dashboard renders
 * registry data consistently across UIs:
 *   - `float` / `int`  → signed bar chart (centered zero)
 *   - `uint`           → unsigned bar chart
 *   - `bits`           → packed-bit pixels
 *   - `float2/3/4`     → per-element magnitude bar chart
 *
 * Left rail: each entry row has a tiny inline sparkline in its kind's
 * color, plus a mean / min / max summary. Right pane: selected entry
 * gets a large version of the same visualizer + the raw-sample grid
 * below. Click entry to select.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { RegistryEntrySnapshot } from '../../devtools-client.js'
import { getClient } from '../client.js'
import { useDevtoolsState } from '../hooks.js'

const ROW_STRIDE = 8

const FILL_BY_KIND: Record<string, string> = {
  float: '#47cca9',
  int: '#47cc6a',
  uint: '#ffa347',
  bits: '#d94c87',
  float2: '#9d7aff',
  float3: '#9d7aff',
  float4: '#9d7aff',
}

export function RegistryPanel() {
  const state = useDevtoolsState()
  const client = getClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  // Default client state has `registrySelection = []` — subscribed to
  // the registry FEATURE (so metadata arrives) but no specific entry
  // names requested, which tells the producer to skip sample bytes.
  // Opt into the unfiltered drain on mount; reset on unmount.
  useEffect(() => {
    client.setRegistry(null)
    return () => { client.setRegistry([]) }
  }, [client])

  const entries = useMemo(() => {
    const arr = Array.from(state.registry.values())
    arr.sort((a, b) => a.name.localeCompare(b.name))
    return arr
  }, [state.registry, state.registry.size])

  const needle = filter.trim().toLowerCase()
  const visible = needle.length > 0
    ? entries.filter((e) => e.name.toLowerCase().includes(needle) || (e.label?.toLowerCase().includes(needle) ?? false))
    : entries

  const effectiveSelected = selected !== null && visible.some((e) => e.name === selected)
    ? selected
    : (visible[0]?.name ?? null)

  const selectedEntry = effectiveSelected !== null ? state.registry.get(effectiveSelected) ?? null : null

  return (
    <section class="panel registry-panel">
      <header class="panel-header registry-header">
        <span>Registry</span>
        <input
          type="text"
          class="protocol-filter"
          placeholder="filter…"
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
        />
        <span class="registry-count">{entries.length}</span>
      </header>
      <div class="registry-layout">
        <ul class="registry-list">
          {visible.length === 0 ? (
            <li class="panel-empty">No entries{needle.length > 0 ? ' match' : ' yet'}.</li>
          ) : (
            visible.map((e) => (
              <li key={e.name}>
                <button
                  type="button"
                  class={
                    'registry-row' +
                    (e.name === effectiveSelected ? ' registry-row-selected' : '')
                  }
                  onClick={() => setSelected(e.name)}
                >
                  <span class="registry-kind">{e.kind}</span>
                  <span class="registry-name">{e.name}</span>
                  <RegistrySparkline entry={e} width={96} height={18} />
                  <span class="registry-count-pill">{e.count}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div class="registry-detail">
          {selectedEntry === null ? (
            <div class="panel-empty">Select an entry.</div>
          ) : (
            <RegistryDetail entry={selectedEntry} />
          )}
        </div>
      </div>
    </section>
  )
}

function RegistrySparkline({
  entry,
  width,
  height,
}: {
  entry: RegistryEntrySnapshot
  width: number
  height: number
}): preact.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Gate redraw on version bumps — the shared rAF fires on every frame
  // but most entries don't change every frame. Redrawing a 10k-sample
  // canvas at 60Hz is the lag source for entries like tileScores.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(width * dpr))
    const h = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    drawVisualizer(ctx, w, h, entry)
  }, [entry.version, entry.name, width, height])
  return (
    <canvas
      class="registry-sparkline"
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px` }}
    />
  )
}

function RegistryDetail({ entry }: { entry: RegistryEntrySnapshot }): preact.JSX.Element {
  const { name, kind, count, sample, label, version } = entry
  const isFloat = sample instanceof Float32Array
  const stats = useMemo(() => computeStats(entry), [entry, entry.version])

  // Element count on the visualizer axis — for vectors this is the
  // number of vectors, for bits it's total bit count, for scalars it's
  // sample.length. The graph cursor and data-viewer highlight both
  // index into this space.
  const axisLen = axisLength(entry)

  // Cursor is purely a mirror of the data-view's scroll position —
  // initialised to 0 so the graph always shows an anchor line on
  // mount. Click on the graph scrolls the data view; cursor follows.
  // Click on a cell pins there too. Manual scroll updates the cursor
  // in real time during the smooth-scroll animation.
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(0)
  const gridScrollerRef = useRef<HTMLDivElement | null>(null)
  const cursorIdx = pinnedIdx

  const scrollGridToAxisIdx = (idx: number): void => {
    const el = gridScrollerRef.current
    if (el === null) return
    const perAxisIdx =
      entry.kind === 'float2' ? 2 :
      entry.kind === 'float3' ? 3 :
      entry.kind === 'float4' ? 4 :
      1
    const scalarIdx = entry.kind === 'bits' ? idx : idx * perAxisIdx
    const rowIdx = Math.floor(scalarIdx / ROW_STRIDE)
    const top = rowIdx * SAMPLE_ROW_HEIGHT
    const target = Math.max(0, top - el.clientHeight / 2 + SAMPLE_ROW_HEIGHT / 2)
    el.scrollTo({ top: target, behavior: 'smooth' })
  }

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Tick bumped whenever the viz-stack resizes (breakpoint swap,
  // sidebar collapse, etc.) so the bars canvas re-sizes + re-draws.
  const [resizeTick, setResizeTick] = useState(0)
  // Bars canvas redraws on version/entry change OR container resize.
  // Cursor lives in the DOM as a positioned <div> (see JSX below) —
  // cheaper than re-drawing a cursor canvas on every mousemove, and
  // the browser compositor handles the line motion without touching
  // React render cost at all.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    drawVisualizer(ctx, w, h, entry, null)
  }, [entry.version, entry.name, resizeTick])

  // Imperative hover-tracking: mousemove updates a `style.left` on the
  // cursor <div> directly without going through React. State only
  // changes on click (pin), so a 60 Hz mousemove storm doesn't trigger
  // re-renders for huge samples.
  const stackRef = useRef<HTMLDivElement | null>(null)
  const cursorDivRef = useRef<HTMLDivElement | null>(null)

  // Watch the viz stack for size changes — single-column / dual-column
  // breakpoint swaps resize the panel without changing the selected
  // entry, so without this the canvas would keep its pre-resize backing
  // buffer and render stretched / clipped.
  useEffect(() => {
    const stack = stackRef.current
    if (stack === null) return
    const obs = new ResizeObserver(() => setResizeTick((t) => (t + 1) & 0xffff))
    obs.observe(stack)
    return () => obs.disconnect()
  }, [])
  const clientXToAxisIdx = (clientX: number): number | null => {
    const stack = stackRef.current
    if (stack === null || axisLen === 0) return null
    const rect = stack.getBoundingClientRect()
    const u = (clientX - rect.left) / rect.width
    if (u < 0 || u > 1) return null
    return Math.min(axisLen - 1, Math.max(0, Math.floor(u * axisLen)))
  }
  // When pinnedIdx changes externally (e.g. via cell click) OR the
  // stack resizes, re-position the cursor div so the pixel offset
  // matches the new container width.
  useEffect(() => {
    const cursor = cursorDivRef.current
    const stack = stackRef.current
    if (cursor === null || stack === null || axisLen === 0) return
    const target = cursorIdx
    if (target === null) {
      cursor.style.display = 'none'
      return
    }
    const rect = stack.getBoundingClientRect()
    const x = ((target + 0.5) / axisLen) * rect.width
    cursor.style.left = `${x}px`
    cursor.style.display = 'block'
  }, [cursorIdx, axisLen, resizeTick])

  // Reset the cursor to index 0 when the entry changes so the graph
  // always has an anchor visible — matches "default view at top".
  useEffect(() => {
    setPinnedIdx(0)
  }, [name])

  return (
    <>
      <div class="registry-detail-header">
        <span class="registry-detail-name">{name}</span>
        {label !== undefined && <span class="registry-detail-label">{label}</span>}
      </div>
      <div class="registry-detail-meta">
        <span>{kind}</span>
        <span>count {count}</span>
        <span>v{version}</span>
        <span>{sample.constructor.name}</span>
        {stats.summary !== '' && <span>{stats.summary}</span>}
        {cursorIdx !== null && (
          <span class="registry-cursor-label">cursor {cursorIdx}</span>
        )}
      </div>
      <div class="registry-viz-wrap">
        <div
          class="registry-viz-stack"
          ref={stackRef}
          onClick={(e) => {
            const idx = clientXToAxisIdx(e.clientX)
            if (idx === null) return
            scrollGridToAxisIdx(idx)
          }}
        >
          <canvas class="registry-viz" ref={canvasRef} />
          <div class="registry-viz-cursor-line" ref={cursorDivRef} />
        </div>
      </div>
      <div class="registry-detail-body">
        {sample.length === 0
          ? <div class="panel-empty">No sample yet.</div>
          : (
              <SampleGrid
                entry={entry}
                stride={ROW_STRIDE}
                float={isFloat}
                pinnedIdx={pinnedIdx}
                scrollerRef={gridScrollerRef}
                onPinIdx={(idx) => setPinnedIdx(idx)}
                onScrollIdx={(idx) => setPinnedIdx(idx)}
              />
            )}
      </div>
    </>
  )
}

const SAMPLE_ROW_HEIGHT = 20
const SAMPLE_OVERSCAN = 8

function SampleGrid({
  entry,
  stride,
  float,
  pinnedIdx,
  scrollerRef,
  onPinIdx,
  onScrollIdx,
}: {
  entry: RegistryEntrySnapshot
  stride: number
  float: boolean
  pinnedIdx: number | null
  scrollerRef: { current: HTMLDivElement | null }
  onPinIdx: (i: number | null) => void
  onScrollIdx: (i: number) => void
}): preact.JSX.Element {
  const { kind, sample } = entry
  const scalarsPerAxisIdx =
    kind === 'float2' ? 2 :
    kind === 'float3' ? 3 :
    kind === 'float4' ? 4 :
    1
  const cursorIdx = pinnedIdx

  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 })

  useEffect(() => {
    const el = scrollerRef.current
    if (el === null) return
    setViewport((v) => ({ ...v, height: el.clientHeight }))
    const obs = new ResizeObserver(() => {
      const h = scrollerRef.current?.clientHeight ?? 0
      setViewport((v) => v.height === h ? v : { ...v, height: h })
    })
    obs.observe(el)
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // User-scroll → update cursor to the axis index at the viewport's
  // center row. Fires every scroll event (including intermediate
  // frames during smooth scroll) so the graph cursor tracks the scroll
  // in real time. Preact dedupes setState when value hasn't changed,
  // keeping the cost bounded.
  const reportScrollIdx = (scrollTop: number, height: number): void => {
    if (height === 0) return
    const centerRow = Math.floor((scrollTop + height / 2) / SAMPLE_ROW_HEIGHT)
    const centerScalarIdx = centerRow * stride
    const axisIdx = kind === 'bits'
      ? centerScalarIdx * 32
      : Math.floor(centerScalarIdx / scalarsPerAxisIdx)
    if (axisIdx >= 0) onScrollIdx(axisIdx)
  }

  const totalRows = Math.ceil(sample.length / stride)
  const start = Math.max(0, Math.floor(viewport.scrollTop / SAMPLE_ROW_HEIGHT) - SAMPLE_OVERSCAN)
  const visibleCount = Math.max(1, Math.ceil(viewport.height / SAMPLE_ROW_HEIGHT) + SAMPLE_OVERSCAN * 2)
  const end = Math.min(totalRows, start + visibleCount)

  const rows: preact.JSX.Element[] = []
  for (let r = start; r < end; r++) {
    const i = r * stride
    const cells: preact.JSX.Element[] = []
    for (let j = 0; j < stride && i + j < sample.length; j++) {
      const scalarIdx = i + j
      const v = sample[scalarIdx]!
      const axisIdxForCell = kind === 'bits'
        ? scalarIdx * 32
        : Math.floor(scalarIdx / scalarsPerAxisIdx)
      const inCursor = cursorIdx !== null && (
        kind === 'bits'
          ? cursorIdx >= axisIdxForCell && cursorIdx < axisIdxForCell + 32
          : axisIdxForCell === cursorIdx
      )
      cells.push(
        <span
          class={`sample-cell${inCursor ? ' sample-cell-cursor' : ''}`}
          title={float ? String(v) : undefined}
          onClick={() => onPinIdx(axisIdxForCell)}
        >
          {float ? fmtFloatFixed(v) : v.toString()}
        </span>,
      )
    }
    rows.push(
      // Key by slot index (r - start) so DOM nodes recycle as the
      // window scrolls — same pattern as the protocol log, avoids
      // mount/unmount thrash at high scroll speeds.
      <div
        class="sample-row"
        key={r - start}
        style={{ transform: `translateY(${r * SAMPLE_ROW_HEIGHT}px)`, height: `${SAMPLE_ROW_HEIGHT}px` }}
      >
        <span class="sample-index">{i}</span>
        {cells}
      </div>,
    )
  }

  const onScroll = (e: Event): void => {
    const el = e.currentTarget as HTMLDivElement
    setViewport((v) => v.scrollTop === el.scrollTop ? v : { ...v, scrollTop: el.scrollTop })
    reportScrollIdx(el.scrollTop, el.clientHeight)
  }

  return (
    <div class="sample-grid-scroller" ref={scrollerRef} onScroll={onScroll}>
      <div class="sample-grid" style={{ height: `${totalRows * SAMPLE_ROW_HEIGHT}px` }}>
        {rows}
      </div>
    </div>
  )
}

function axisLength(entry: RegistryEntrySnapshot): number {
  const { kind, sample, count } = entry
  if (kind === 'bits') return count * 32
  if (kind === 'float2') return Math.floor(sample.length / 2)
  if (kind === 'float3') return Math.floor(sample.length / 3)
  if (kind === 'float4') return Math.floor(sample.length / 4)
  return sample.length
}

/**
 * Fixed-width decimal formatter for the sample grid. Keeps every cell
 * the same character count so the grid reads like a hex dump. The raw
 * value lives in the cell's `title` attribute for tooltip lookup when
 * precision matters.
 */
function fmtFloatFixed(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '     +∞' : v < 0 ? '     -∞' : '   NaN '
  if (v === 0) return '  0.000'
  const abs = Math.abs(v)
  if (abs >= 1e4 || abs < 1e-3) {
    // Scientific, 2 sig figs: `±1.23e+4` — 8 chars.
    return v.toExponential(2).padStart(8)
  }
  return v.toFixed(3).padStart(8)
}

function computeStats(entry: RegistryEntrySnapshot): { summary: string } {
  const { kind, sample, count } = entry
  if (kind === 'bits') {
    const data = sample as Uint32Array
    let ones = 0
    for (let i = 0; i < data.length; i++) {
      let w = data[i]! >>> 0
      while (w !== 0) { ones += w & 1; w >>>= 1 }
    }
    return { summary: `${ones} / ${count * 32} set` }
  }
  if (kind === 'float2' || kind === 'float3' || kind === 'float4') {
    const stride = kind === 'float2' ? 2 : kind === 'float3' ? 3 : 4
    const n = Math.floor(sample.length / stride)
    let sum = 0
    for (let i = 0; i < n; i++) {
      let sq = 0
      for (let c = 0; c < stride; c++) sq += sample[i * stride + c]! ** 2
      sum += Math.sqrt(sq)
    }
    return { summary: n > 0 ? `μ|v|=${(sum / n).toFixed(2)}` : '' }
  }
  const n = sample.length
  if (n === 0) return { summary: '' }
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (let i = 0; i < n; i++) {
    const v = sample[i]!
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  const mean = sum / n
  const f = (v: number) => kind === 'uint' || kind === 'int'
    ? Math.round(v).toString()
    : v.toFixed(2)
  return { summary: `μ=${f(mean)}  ${f(min)}–${f(max)}` }
}

/**
 * Dispatch to a kind-appropriate visualizer. Bars for numeric arrays,
 * per-element magnitudes for vector arrays, bit pixels for bitmasks.
 * All renderers assume the canvas has already been DPR-sized by the
 * caller.
 */
function drawVisualizer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  entry: RegistryEntrySnapshot,
  cursorIdx: number | null = null,
): void {
  ctx.clearRect(0, 0, w, h)
  const { kind, sample } = entry
  if (sample.length === 0) return
  const color = FILL_BY_KIND[kind] ?? '#47cca9'

  if (kind === 'bits') {
    drawBits(ctx, w, h, sample as Uint32Array, entry.count, color)
  } else if (kind === 'float2' || kind === 'float3' || kind === 'float4') {
    const stride = kind === 'float2' ? 2 : kind === 'float3' ? 3 : 4
    const n = Math.floor(sample.length / stride)
    if (n > 0) {
      const mags = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        let sq = 0
        for (let c = 0; c < stride; c++) sq += sample[i * stride + c]! ** 2
        mags[i] = Math.sqrt(sq)
      }
      drawBars(ctx, w, h, mags, false, color)
    }
  } else {
    const isSigned = kind === 'int' || kind === 'float'
    drawBars(ctx, w, h, sample, isSigned, color)
  }

  // Cursor playhead on top of the bars. Drawn once per render so it
  // stays in sync with whichever sample the data viewer is showing.
  if (cursorIdx !== null) {
    const axis = axisLength(entry)
    if (axis > 0) {
      const x = Math.floor(((cursorIdx + 0.5) / axis) * w)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
      // Thin wash behind the line so the cursor reads even when the
      // underlying bar at that index is tall.
      const band = Math.max(2, Math.ceil(w / axis))
      ctx.fillRect(x - Math.floor(band / 2), 0, band, h)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.fillRect(x, 0, Math.max(1, Math.round(window.devicePixelRatio || 1)), h)
    }
  }
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sample: Float32Array | Int32Array | Uint32Array,
  isSigned: boolean,
  color: string,
): void {
  let min = Infinity
  let max = -Infinity
  const n = sample.length
  for (let i = 0; i < n; i++) {
    const v = sample[i]!
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return

  const zeroY = isSigned ? h / 2 : h
  const scale = isSigned
    ? (h / 2) / Math.max(Math.abs(min), Math.abs(max) || 1)
    : h / (max || 1)

  ctx.fillStyle = color

  // If samples outnumber pixels (e.g. tileScores with 10k+ entries on a
  // ~500px canvas) draw one bar per pixel column with the column's
  // min/max envelope. Straight 1-bar-per-sample would mean tens of
  // thousands of overlapping fillRect calls per frame and tanked perf
  // in practice.
  if (n > w) {
    for (let x = 0; x < w; x++) {
      const lo = Math.floor((x / w) * n)
      const hi = Math.max(lo + 1, Math.floor(((x + 1) / w) * n))
      let cmin = Infinity
      let cmax = -Infinity
      for (let i = lo; i < hi; i++) {
        const v = sample[i]!
        if (v < cmin) cmin = v
        if (v > cmax) cmax = v
      }
      if (!Number.isFinite(cmin)) continue
      if (isSigned) {
        const yTop = zeroY - cmax * scale
        const yBot = zeroY - cmin * scale
        ctx.fillRect(x, Math.min(yTop, yBot), 1, Math.max(1, Math.abs(yBot - yTop)))
      } else {
        const bh = cmax * scale
        ctx.fillRect(x, zeroY - bh, 1, bh)
      }
    }
  } else {
    const bw = Math.max(1, w / n)
    for (let i = 0; i < n; i++) {
      const v = sample[i]!
      const x = Math.floor((i / n) * w)
      const bh = v * scale
      if (isSigned) {
        if (bh >= 0) ctx.fillRect(x, zeroY - bh, Math.ceil(bw), bh)
        else ctx.fillRect(x, zeroY, Math.ceil(bw), -bh)
      } else {
        ctx.fillRect(x, zeroY - bh, Math.ceil(bw), bh)
      }
    }
  }

  if (isSigned) {
    ctx.fillStyle = 'rgba(240, 237, 216, 0.2)'
    ctx.fillRect(0, Math.floor(zeroY), w, 1)
  }
}

function drawBits(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sample: Uint32Array,
  count: number,
  color: string,
): void {
  const totalBits = count * 32
  if (totalBits === 0) return
  const px = w / totalBits
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    const word = sample[i]! >>> 0
    for (let b = 0; b < 32; b++) {
      if ((word >>> b) & 1) {
        const bitIdx = i * 32 + b
        const x = Math.floor(bitIdx * px)
        ctx.fillRect(x, 2, Math.max(1, Math.ceil(px)), h - 4)
      }
    }
  }
}
