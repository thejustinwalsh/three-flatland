/**
 * Cycling stats graph — click to cycle FPS / MS / MEM (like stats.js).
 *
 * Replicates the exact DOM structure of Tweakpane's built-in fpsgraph blade.
 * Uses SVG polyline like GraphLogView (tp-grlv). Click anywhere to cycle modes.
 * Only the graph line is colorized per mode; text uses default Tweakpane colors.
 */

import type { FolderApi, Pane } from 'tweakpane'
import { STATS_BATCH_MS } from 'three-flatland/debug-protocol'

import type { DevtoolsClient, DevtoolsSeries } from './devtools-client.js'

export interface StatsGraphHandle {
  /** The root element */
  readonly element: HTMLElement
  /**
   * Render a frame. Required when constructed with `driver: 'manual'`;
   * no-op for the `'raf'` driver (the internal rAF is doing it).
   */
  update(): void
  /** Stop and remove. */
  dispose(): void
}

export interface AddStatsGraphOptions {
  rows?: number
  /**
   * `'raf'` (default) — the graph runs its own `requestAnimationFrame`
   * loop. `'manual'` — no rAF; caller drives via `handle.update()` from
   * their own frame tick (e.g. `renderer.setAnimationLoop`, R3F
   * `useFrame`).
   */
  driver?: 'raf' | 'manual'
}

type Mode = 'fps' | 'ms' | 'gpu' | 'mem'

// Cycle order: FPS → MS → GPU → MEM (gpu next to ms so you can A/B them).
const MODES: Mode[] = ['fps', 'ms', 'gpu', 'mem']
const BUFFER_SIZE = 80

// Retro-themed line colors (only applied to the graph line)
const MODE_COLORS: Record<Mode, string> = {
  fps: '#47cca9', // retro-cyan
  ms: '#47cc6a', // green variant
  gpu: '#ffa347', // retro-amber
  mem: '#d94c87', // retro-pink
}

// Unit labels shown next to the live value overlay (bottom-right of the
// graph). The left-side mode label distinguishes fps/ms/gpu/mem; this is
// just the unit of the number itself, so `gpu` (also milliseconds) reads
// `MS` here.
const MODE_UNITS: Record<Mode, string> = {
  fps: 'FPS',
  ms: 'MS',
  gpu: 'MS',
  mem: 'MB',
}

/**
 * Add a cycling stats graph to a Tweakpane parent.
 * Matches the visual design of the built-in fpsgraph blade.
 */
export function addStatsGraph(
  parent: Pane | FolderApi,
  client: DevtoolsClient,
  options: AddStatsGraphOptions = {},
): StatsGraphHandle {
  const { rows = 2, driver = 'raf' } = options

  // State
  let mode: Mode = 'fps'
  let modeIndex = 0

  // Graph max scales
  // FPS: 120 (tops out at 120fps)
  // MS: 16.67 (one frame at 60fps — hitting the top means blown frame budget)
  // GPU: 16.67 (same frame budget as MS, just measured on the GPU side)
  // MEM: heap limit in MB — pulled from `state.heapLimitMB` once it
  //      arrives; default 256 until then.
  const graphMax: Record<Mode, number> = {
    fps: 120,
    ms: 16.67,
    gpu: 16.67,
    mem: 256,
  }

  // Session min/max tracking (like stats.js displays "60 FPS (55-62)")
  const sessionMin: Record<Mode, number> = { fps: Infinity, ms: Infinity, gpu: Infinity, mem: Infinity }
  const sessionMax: Record<Mode, number> = { fps: 0, ms: 0, gpu: 0, mem: 0 }

  // ── Build DOM matching Tweakpane's label + graph structure ──

  // tp-lblv: label view (left label + right value)
  const lblv = document.createElement('div')
  lblv.className = 'tp-lblv'
  lblv.style.cursor = 'pointer'

  const lblvL = document.createElement('div')
  lblvL.className = 'tp-lblv_l'
  lblvL.textContent = 'fps'
  lblv.appendChild(lblvL)

  // Value area (right side — full width when no label)
  const lblvV = document.createElement('div')
  lblvV.className = 'tp-lblv_v'
  lblv.appendChild(lblvV)

  // tp-fpsv: FPS view container (positions the overlay label)
  const fpsv = document.createElement('div')
  fpsv.className = 'tp-fpsv'
  lblvV.appendChild(fpsv)

  // tp-fpsv_g: graph area
  const fpsvG = document.createElement('div')
  fpsvG.className = 'tp-fpsv_g'
  fpsv.appendChild(fpsvG)

  // tp-grlv: graph log view (SVG)
  const grlv = document.createElement('div')
  grlv.className = 'tp-grlv'
  fpsvG.appendChild(grlv)

  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.classList.add('tp-grlv_g')
  svg.style.height = `calc(var(--cnt-usz, 20px) * ${rows})`
  svg.setAttribute('preserveAspectRatio', 'none')
  grlv.appendChild(svg)

  // Fill area (closed polygon under the line)
  const fillPoly = document.createElementNS(svgNS, 'polygon')
  fillPoly.style.stroke = 'none'
  svg.appendChild(fillPoly)

  // Stroke line
  const polyline = document.createElementNS(svgNS, 'polyline')
  svg.appendChild(polyline)

  // tp-fpsv_l: value label overlay (bottom-right) with bg for readability
  const fpsvL = document.createElement('div')
  fpsvL.className = 'tp-fpsv_l'
  fpsvL.style.cssText = 'background:rgba(0,2,28,0.65);padding:1px 4px;border-radius:2px;'
  fpsv.appendChild(fpsvL)

  const valueSpan = document.createElement('span')
  valueSpan.className = 'tp-fpsv_v'
  valueSpan.textContent = '--'
  fpsvL.appendChild(valueSpan)

  const unitSpan = document.createElement('span')
  unitSpan.className = 'tp-fpsv_u'
  unitSpan.textContent = 'FPS'
  fpsvL.appendChild(unitSpan)

  // ── Inject into Tweakpane via a real blade slot ──
  // Use addBlade to get a proper slot in the blade rack (maintains ordering).
  // Then replace the blade element's inner content with our custom graph.

  const blade = parent.addBlade({ view: 'separator' })
  const bladeEl = blade.element

  // Replace separator content with our graph layout
  bladeEl.innerHTML = ''
  bladeEl.className = 'tp-cntv'
  bladeEl.style.cssText = ''
  bladeEl.appendChild(lblv)

  // ── Mode cycling ──

  function applyMode() {
    polyline.style.stroke = MODE_COLORS[mode]
    fillPoly.style.fill = MODE_COLORS[mode]
    fillPoly.style.opacity = '0.33'
    lblvL.textContent = mode
    unitSpan.textContent = MODE_UNITS[mode]
  }
  applyMode()

  lblv.addEventListener('click', () => {
    // Only cycle to modes the producer is actually streaming values for
    // (gpuMs for gpu, heapUsedMB for mem). Client state is the source of
    // truth — no separate enabled flags.
    const state = client.state
    do {
      modeIndex = (modeIndex + 1) % MODES.length
      mode = MODES[modeIndex]!
    } while (
      (mode === 'mem' && state.heapUsedMB === undefined) ||
      (mode === 'gpu' && !state.gpuModeEnabled)
    )
    applyMode()
  })

  // ── Graph rendering ──

  // Cache SVG dimensions via ResizeObserver to avoid getBoundingClientRect()
  // on every frame. Safari's layout engine is expensive for SVG reflows and
  // per-frame getBoundingClientRect() causes severe frame drops (~24fps).
  let cachedW = 0
  let cachedH = 0
  const resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    const r = entry.contentRect
    cachedW = r.width
    cachedH = r.height
    if (cachedW > 0 && cachedH > 0) {
      svg.setAttribute('viewBox', `0 0 ${cachedW} ${cachedH}`)
    }
  })
  resizeObserver.observe(svg)

  const MODE_LABEL: Record<Mode, string> = { fps: 'fps', ms: 'ms', gpu: 'gpu', mem: 'mem' }
  const MODE_VALUE_UNIT: Record<Mode, string> = { fps: 'FPS', ms: 'MS', gpu: 'MS', mem: 'MB' }
  const MODE_RANGE_UNIT: Record<Mode, string> = { fps: 'FPS', ms: 'MS', gpu: 'GPU', mem: 'MB' }
  const MODE_DECIMALS: Record<Mode, number> = { fps: 0, ms: 1, gpu: 1, mem: 0 }

  function seriesFor(m: Mode): DevtoolsSeries {
    const s = client.state.series
    switch (m) {
      case 'fps': return s.fps
      case 'ms': return s.cpuMs
      case 'gpu': return s.gpuMs
      case 'mem': return s.heapUsedMB
    }
  }

  // ── Arrival snapshots (written in the listener, read in RAF) ──────────
  // The listener only snapshots values and resets the interpolation
  // clock. RAF does all rendering, so the display stays smooth between
  // the 4 Hz batches.
  const prevLabel: Record<Mode, number> = { fps: 0, ms: 0, gpu: 0, mem: 0 }
  const currLabel: Record<Mode, number> = { fps: 0, ms: 0, gpu: 0, mem: 0 }
  const hasLabel: Record<Mode, boolean> = { fps: false, ms: false, gpu: false, mem: false }
  let batchCount = 0
  let lastBatchAt = performance.now()
  let prevRingWrite = 0

  const snap = (m: Mode, v: number | undefined): void => {
    if (v === undefined) return
    prevLabel[m] = hasLabel[m] ? currLabel[m] : v
    currLabel[m] = v
    hasLabel[m] = true
  }

  const unsubscribe = client.addListener((s) => {
    if (s.heapLimitMB !== undefined) graphMax.mem = s.heapLimitMB
    snap('fps', s.fps)
    snap('ms', s.cpuMs)
    snap('gpu', s.gpuMs)
    snap('mem', s.heapUsedMB)
    // How many new samples came in this batch? All series write in
    // lockstep, so we can just watch `fps`.
    const fps = s.series.fps
    const size = fps.data.length
    const delta = (fps.write - prevRingWrite + size) % size
    if (delta > 0) {
      batchCount = delta
      prevRingWrite = fps.write
      lastBatchAt = performance.now()
    }
  })

  // ── Render ────────────────────────────────────────────────────────────
  // `update()` is pure reads + two DOM writes (polyline + fill). The
  // only allocation is the `pointsStr` concatenation, unavoidable for
  // SVG `setAttribute`.

  let rafId = 0
  let disposed = false
  let pointsStr = ''

  function update(): void {
    if (disposed) return
    if (cachedW === 0 || cachedH === 0) return

    const now = performance.now()
    const t = Math.min(1, Math.max(0, (now - lastBatchAt) / STATS_BATCH_MS))

    // Polyline: slide the display window through the ring so the newest
    // samples fade in smoothly. At t=0 the right edge sits `batchCount`
    // samples behind the ring's write head; at t=1 it has caught up.
    const ring = seriesFor(mode)
    const size = ring.data.length
    const max = graphMax[mode] || 1
    const rightOffset = batchCount * (1 - t)
    const startFloat = ring.write - rightOffset - BUFFER_SIZE + size * 2
    pointsStr = ''
    let mn = Infinity
    let mx = 0
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const fi = startFloat + i
      const aIdx = Math.floor(fi) % size
      const bIdx = (aIdx + 1) % size
      const frac = fi - Math.floor(fi)
      const a = ring.data[aIdx]!
      const b = ring.data[bIdx]!
      const v = a * (1 - frac) + b * frac
      if (v < mn) mn = v
      if (v > mx) mx = v
      const x = (i / (BUFFER_SIZE - 1)) * cachedW
      const y = cachedH - (v / max) * cachedH * 0.85 - cachedH * 0.05
      pointsStr += i === 0 ? `${x},${y}` : ` ${x},${y}`
    }
    if (hasLabel[mode]) {
      sessionMin[mode] = Math.min(sessionMin[mode], mn)
      sessionMax[mode] = Math.max(sessionMax[mode], mx)
    }
    polyline.setAttribute('points', pointsStr)
    fillPoly.setAttribute('points', `${pointsStr} ${cachedW},${cachedH} 0,${cachedH}`)

    // Label: lerp prev→curr over the same t, so the number transitions
    // smoothly instead of jumping on batch boundaries.
    const has = hasLabel[mode]
    const lerped = prevLabel[mode] + (currLabel[mode] - prevLabel[mode]) * t
    const sMn = sessionMin[mode]
    const sMx = sessionMax[mode]
    const range = sMn !== Infinity ? `${Math.round(sMn)}–${Math.round(sMx)}` : ''
    lblvL.textContent = MODE_LABEL[mode]
    lblvL.title = range ? `${MODE_RANGE_UNIT[mode]} range: ${range}` : ''
    valueSpan.textContent = has ? lerped.toFixed(MODE_DECIMALS[mode]) : '--'
    unitSpan.textContent = MODE_VALUE_UNIT[mode]
  }

  if (driver === 'raf') {
    const autoFrame = (): void => {
      if (disposed) return
      rafId = requestAnimationFrame(autoFrame)
      update()
    }
    rafId = requestAnimationFrame(autoFrame)
  }

  return {
    element: bladeEl,
    // In `'raf'` mode the internal loop already runs, so public `update()`
    // is a no-op — we don't want to paint twice per frame when the host
    // also (redundantly) drives it. In `'manual'` mode this is the only
    // way the graph gets painted.
    update: driver === 'manual' ? update : () => {},
    dispose() {
      disposed = true
      if (rafId !== 0) cancelAnimationFrame(rafId)
      unsubscribe()
      resizeObserver.disconnect()
      blade.dispose()
    },
  }
}
