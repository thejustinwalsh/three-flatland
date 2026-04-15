/**
 * Cycling stats graph — click to cycle FPS / MS / MEM (like stats.js).
 *
 * Replicates the exact DOM structure of Tweakpane's built-in fpsgraph blade.
 * Uses SVG polyline like GraphLogView (tp-grlv). Click anywhere to cycle modes.
 * Only the graph line is colorized per mode; text uses default Tweakpane colors.
 */

import type { FolderApi, Pane } from 'tweakpane'

export interface StatsGraphHandle {
  /** Call at start of frame */
  begin(): void
  /** Call at end of frame */
  end(): void
  /** The root element */
  readonly element: HTMLElement
  /** Stop and remove */
  dispose(): void
  /**
   * Push a GPU frame time (in milliseconds) to the 'gpu' mode buffer.
   * No-op if GPU mode hasn't been enabled yet.
   */
  pushGpuTime(ms: number): void
  /**
   * Enable the 'gpu' mode in the click-cycle. Call once when GPU timing
   * capability is detected (`renderer.backend.trackTimestamp === true`).
   */
  enableGpuMode(): void
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
interface PerformanceMemory {
  readonly usedJSHeapSize: number
  readonly jsHeapSizeLimit: number
}

export function addStatsGraph(
  parent: Pane | FolderApi,
  options: { rows?: number } = {},
): StatsGraphHandle {
  const { rows = 2 } = options

  const perfMemory = (performance as Performance & { memory?: PerformanceMemory }).memory

  // State
  let mode: Mode = 'fps'
  let modeIndex = 0
  let gpuEnabled = false

  // Buffers per mode
  const makeBuffer = (): number[] => Array.from({ length: BUFFER_SIZE }, () => 0)
  const buffers: Record<Mode, number[]> = {
    fps: makeBuffer(),
    ms: makeBuffer(),
    gpu: makeBuffer(),
    mem: makeBuffer(),
  }
  const bufferIdx: Record<Mode, number> = { fps: 0, ms: 0, gpu: 0, mem: 0 }

  // Graph max scales
  // FPS: 120 (tops out at 120fps)
  // MS: 16.67 (one frame at 60fps — hitting the top means blown frame budget)
  // GPU: 16.67 (same frame budget as MS, just measured on the GPU side)
  // MEM: heap limit in MB
  const graphMax: Record<Mode, number> = {
    fps: 120,
    ms: 16.67,
    gpu: 16.67,
    mem: perfMemory ? perfMemory.jsHeapSizeLimit / 1048576 : 256,
  }

  // Session min/max tracking (like stats.js displays "60 FPS (55-62)")
  const sessionMin: Record<Mode, number> = { fps: Infinity, ms: Infinity, gpu: Infinity, mem: Infinity }
  const sessionMax: Record<Mode, number> = { fps: 0, ms: 0, gpu: 0, mem: 0 }

  // FPS/MS/GPU tracking
  let beginTime = 0
  let fpsFrames = 0
  let fpsStartTime = performance.now()
  let lastFps = 0
  let lastMs = 0
  let lastGpu = 0

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
    do {
      modeIndex = (modeIndex + 1) % MODES.length
      mode = MODES[modeIndex]!
    } while (
      (mode === 'mem' && !perfMemory) ||
      (mode === 'gpu' && !gpuEnabled)
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

  function pushValue(m: Mode, val: number) {
    buffers[m][bufferIdx[m] % BUFFER_SIZE] = val
    bufferIdx[m]++
    sessionMin[m] = Math.min(sessionMin[m], val)
    sessionMax[m] = Math.max(sessionMax[m], val)
  }

  function updateGraph() {
    if (cachedW === 0 || cachedH === 0) return

    const buf = buffers[mode]
    const idx = bufferIdx[mode]
    const max = graphMax[mode]

    const points: string[] = []
    for (let i = 0; i < BUFFER_SIZE; i++) {
      const val = buf[(idx + i) % BUFFER_SIZE]!
      const x = (i / (BUFFER_SIZE - 1)) * cachedW
      const y = cachedH - (val / max) * cachedH * 0.85 - cachedH * 0.05
      points.push(`${x},${y}`)
    }
    polyline.setAttribute('points', points.join(' '))
    // Closed polygon for fill: line points + bottom-right + bottom-left
    fillPoly.setAttribute('points', `${points.join(' ')} ${cachedW},${cachedH} 0,${cachedH}`)
  }

  function updateLabel() {
    const mn = sessionMin[mode]
    const mx = sessionMax[mode]
    const range = mn !== Infinity ? `${Math.round(mn)}–${Math.round(mx)}` : ''

    switch (mode) {
      case 'fps':
        lblvL.textContent = 'fps'
        lblvL.title = range ? `FPS range: ${range}` : ''
        valueSpan.textContent = lastFps.toFixed(0)
        unitSpan.textContent = 'FPS'
        break
      case 'ms':
        lblvL.textContent = 'ms'
        lblvL.title = range ? `MS range: ${range}` : ''
        valueSpan.textContent = lastMs.toFixed(1)
        unitSpan.textContent = 'MS'
        break
      case 'gpu':
        lblvL.textContent = 'gpu'
        lblvL.title = range ? `GPU range: ${range}` : ''
        valueSpan.textContent = lastGpu.toFixed(1)
        unitSpan.textContent = 'MS'
        break
      case 'mem': {
        const memMB = perfMemory ? perfMemory.usedJSHeapSize / 1048576 : 0
        lblvL.textContent = 'mem'
        lblvL.title = range ? `MB range: ${range}` : ''
        valueSpan.textContent = memMB.toFixed(0)
        unitSpan.textContent = 'MB'
        break
      }
    }
  }

  return {
    element: bladeEl,
    begin() {
      beginTime = performance.now()
    },
    end() {
      const now = performance.now()
      const frameMs = now - beginTime

      pushValue('ms', frameMs)
      lastMs = frameMs

      fpsFrames++
      if (now - fpsStartTime >= 1000) {
        lastFps = (fpsFrames * 1000) / (now - fpsStartTime)
        pushValue('fps', lastFps)
        fpsStartTime = now
        fpsFrames = 0
      }

      // Sample memory and update visuals in the same frame as the render
      // loop — no independent RAF. A second RAF callback with SVG mutations
      // causes Safari to throttle the entire tab to ~20fps.
      if (perfMemory) {
        pushValue('mem', perfMemory.usedJSHeapSize / 1048576)
      }
      updateLabel()
      updateGraph()
    },
    pushGpuTime(ms) {
      if (!gpuEnabled) return
      if (!Number.isFinite(ms) || ms < 0) return
      lastGpu = ms
      pushValue('gpu', ms)
    },
    enableGpuMode() {
      gpuEnabled = true
    },
    dispose() {
      resizeObserver.disconnect()
      blade.dispose()
    },
  }
}
