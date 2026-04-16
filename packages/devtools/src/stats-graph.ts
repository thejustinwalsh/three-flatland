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

  // tp-grlv: graph log view. We render into a 2D canvas instead of an
  // SVG polyline because per-frame `setAttribute('points', ...)` was
  // (a) allocating long template-literal strings every rAF and (b)
  // forcing the browser to re-allocate CSS-selector strings to
  // re-evaluate styles for every ancestor in the `.tp-cntv .tp-v-fst …`
  // chain — a measurable string-GC cost in profiles. Canvas drawing is
  // pure path commands, no DOM mutation.
  const grlv = document.createElement('div')
  grlv.className = 'tp-grlv'
  fpsvG.appendChild(grlv)

  const canvas = document.createElement('canvas')
  canvas.classList.add('tp-grlv_g')
  canvas.style.cssText = `display:block;width:100%;height:calc(var(--cnt-usz, 20px) * ${rows})`
  canvas.width = 1
  canvas.height = 1
  grlv.appendChild(canvas)
  const gfx = canvas.getContext('2d')

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

  // Sync canvas backing to CSS box × DPR so 1 source pixel = 1 device
  // pixel; avoids per-frame `getBoundingClientRect` which Safari pays
  // dearly for, and keeps the polyline crisp on HiDPI.
  let cachedW = 0
  let cachedH = 0
  const resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    const r = entry.contentRect
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(r.width * dpr))
    const h = Math.max(1, Math.round(r.height * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    cachedW = w
    cachedH = h
  })
  resizeObserver.observe(canvas)

  const MODE_LABEL: Record<Mode, string> = { fps: 'fps', ms: 'ms', gpu: 'gpu', mem: 'mem' }
  const MODE_VALUE_UNIT: Record<Mode, string> = { fps: 'FPS', ms: 'MS', gpu: 'MS', mem: 'MB' }
  const MODE_RANGE_UNIT: Record<Mode, string> = { fps: 'FPS', ms: 'MS', gpu: 'GPU', mem: 'MB' }
  const MODE_DECIMALS: Record<Mode, number> = { fps: 0, ms: 1, gpu: 1, mem: 0 }
  const MODE_SCALE: Record<Mode, number> = { fps: 1, ms: 10, gpu: 10, mem: 1 }

  // Rounded-integer-keyed cache for the `toFixed` result per mode.
  // `toFixed` allocates a fresh string every call; with this cache,
  // we only allocate when the rounded display value actually changes
  // (e.g. fps stays at 60 for many rAF ticks while the lerped value
  // wiggles in the high 59s — single string reused for the whole run).
  const fmtCache: Record<Mode, { key: number; str: string }> = {
    fps: { key: NaN, str: '' },
    ms: { key: NaN, str: '' },
    gpu: { key: NaN, str: '' },
    mem: { key: NaN, str: '' },
  }
  function fmtCached(m: Mode, v: number): string {
    const key = Math.round(v * MODE_SCALE[m])
    const c = fmtCache[m]
    if (c.key === key) return c.str
    c.key = key
    c.str = v.toFixed(MODE_DECIMALS[m])
    return c.str
  }

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
  // Canvas path-based draw — no DOM attribute mutation per frame, no
  // string allocations beyond the unavoidable `toFixed` for the text
  // label (and even those are deduped: textContent is only re-assigned
  // when the rendered string actually changes).

  let rafId = 0
  let disposed = false

  function setText(node: HTMLElement, next: string, cache: { v: string }): void {
    if (cache.v === next) return
    node.textContent = next
    cache.v = next
  }
  // Boxed cache holders keep `setText` allocation-free past creation.
  const labelCache = { v: '' }
  const valueCache = { v: '' }
  const unitCache = { v: '' }
  const titleCache = { v: '' }

  function update(): void {
    if (disposed) return
    if (cachedW === 0 || cachedH === 0 || gfx === null) return

    const now = performance.now()
    const t = Math.min(1, Math.max(0, (now - lastBatchAt) / STATS_BATCH_MS))

    // Slide the display window through the ring so newest samples fade
    // in. At t=0 the right edge sits `batchCount` samples behind the
    // ring's write head; at t=1 it has caught up.
    const ring = seriesFor(mode)
    const size = ring.data.length
    const max = graphMax[mode] || 1
    const rightOffset = batchCount * (1 - t)
    const startFloat = ring.write - rightOffset - BUFFER_SIZE + size * 2

    const w = cachedW
    const h = cachedH
    gfx.clearRect(0, 0, w, h)

    // Build the polyline directly into a path. Track first point so we
    // can close the fill polygon by lining back to the bottom corners.
    const color = MODE_COLORS[mode]
    gfx.beginPath()
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
      const x = (i / (BUFFER_SIZE - 1)) * w
      const y = h - (v / max) * h * 0.85 - h * 0.05
      if (i === 0) gfx.moveTo(x, y)
      else gfx.lineTo(x, y)
    }

    // Translucent fill under the line. Closing the path by lining to
    // bottom-right then bottom-left.
    gfx.lineTo(w, h)
    gfx.lineTo(0, h)
    gfx.closePath()
    gfx.fillStyle = color
    gfx.globalAlpha = 0.33
    gfx.fill()
    gfx.globalAlpha = 1

    // Re-stroke the line over the fill so the top edge is sharp.
    // Re-traversing the polyline path keeps allocations to zero.
    gfx.beginPath()
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const fi = startFloat + i
      const aIdx = Math.floor(fi) % size
      const bIdx = (aIdx + 1) % size
      const frac = fi - Math.floor(fi)
      const a = ring.data[aIdx]!
      const b = ring.data[bIdx]!
      const v = a * (1 - frac) + b * frac
      const x = (i / (BUFFER_SIZE - 1)) * w
      const y = h - (v / max) * h * 0.85 - h * 0.05
      if (i === 0) gfx.moveTo(x, y)
      else gfx.lineTo(x, y)
    }
    gfx.strokeStyle = color
    gfx.lineWidth = Math.max(1, (window.devicePixelRatio || 1))
    gfx.stroke()

    if (hasLabel[mode]) {
      sessionMin[mode] = Math.min(sessionMin[mode], mn)
      sessionMax[mode] = Math.max(sessionMax[mode], mx)
    }

    // Text — lerp the label's number toward the latest batch mean.
    // `toFixed` allocates a new string each call (~one per rAF) but
    // we dedupe assignment to avoid setting `textContent` redundantly,
    // which would trigger DOM mutation work even when the string is
    // identical.
    const has = hasLabel[mode]
    const lerped = prevLabel[mode] + (currLabel[mode] - prevLabel[mode]) * t
    const sMn = sessionMin[mode]
    const sMx = sessionMax[mode]
    setText(lblvL, MODE_LABEL[mode], labelCache)
    setText(valueSpan, has ? fmtCached(mode, lerped) : '--', valueCache)
    setText(unitSpan, MODE_VALUE_UNIT[mode], unitCache)
    const nextTitle = sMn !== Infinity ? `${MODE_RANGE_UNIT[mode]} range: ${Math.round(sMn)}–${Math.round(sMx)}` : ''
    if (titleCache.v !== nextTitle) {
      lblvL.title = nextTitle
      titleCache.v = nextTitle
    }
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
