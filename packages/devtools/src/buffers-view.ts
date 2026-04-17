/**
 * Buffers view — compact one-row preview of the currently-selected
 * debug buffer, with `◀ name ▶` arrows to cycle through every
 * registered entry and a ⤢ "expand" icon overlay on the thumbnail
 * that opens (a future) fullscreen modal.
 *
 * Main-pane real estate is tight: there's no grouping UI here. The
 * fullscreen modal is where the group tree / channel toggles / pan &
 * zoom live. Starts collapsed — no pixel readback happens until the
 * user opens the blade.
 */

import type { FolderApi, Pane } from 'tweakpane'

import type { BufferSnapshot, DevtoolsClient } from './devtools-client.js'

export interface BuffersViewHandle {
  readonly element: HTMLElement
  dispose(): void
}

const THUMB_WIDTH = 240
// A bit taller than before now that the size/format text overlays the
// canvas instead of taking its own row below.
const THUMB_HEIGHT = 120

export interface AddBuffersViewOptions {
  /**
   * Invoked when the user clicks the bottom-right ⤢ button. Wired by
   * `createPane` to open the fullscreen modal viewer with the active
   * buffer pre-selected. When omitted, the click is a no-op.
   */
  onExpand?: (name: string) => void
}

export function addBuffersView(
  parent: Pane | FolderApi,
  client: DevtoolsClient,
  options: AddBuffersViewOptions = {},
): BuffersViewHandle {
  const blade = parent.addBlade({ view: 'separator' }) as unknown as {
    element: HTMLElement
    dispose(): void
  }
  const bladeEl = blade.element
  bladeEl.innerHTML = ''
  bladeEl.className = 'tp-cntv'
  // Same darker-bg treatment as registry-view to sink debug readouts
  // visually behind the controls.
  bladeEl.style.cssText = 'display:none;flex-direction:column;background:rgba(0,0,0,0.3)'

  // Header — identical pattern to registry-view (click to collapse,
  // arrows cycle with stopPropagation so they don't also toggle).
  const header = document.createElement('div')
  header.style.cssText = [
    'display:grid',
    'grid-template-columns:2em 1fr 2em',
    'align-items:center',
    'padding:4px 6px 6px',
    'font-size:11px',
    'color:var(--tp-label-foreground-color)',
    'user-select:none',
    '-webkit-user-select:none',
    'font-variant-numeric:tabular-nums',
    'cursor:pointer',
  ].join(';')

  const arrowStyle = 'cursor:pointer;padding:0 4px;opacity:0.8;font-family:ui-monospace,monospace;text-align:center'
  const prevBtn = document.createElement('span')
  prevBtn.textContent = '◀'
  prevBtn.style.cssText = arrowStyle
  prevBtn.setAttribute('role', 'button')
  prevBtn.setAttribute('aria-label', 'Previous buffer')
  const nameLabel = document.createElement('span')
  nameLabel.style.cssText = 'font-weight:500;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none'
  const nextBtn = document.createElement('span')
  nextBtn.textContent = '▶'
  nextBtn.style.cssText = arrowStyle
  nextBtn.setAttribute('role', 'button')
  nextBtn.setAttribute('aria-label', 'Next buffer')
  header.appendChild(prevBtn)
  header.appendChild(nameLabel)
  header.appendChild(nextBtn)

  // Body — thumbnail canvas with two corner overlays: dimensions/format
  // bottom-left, expand icon bottom-right. No separate text row, so the
  // canvas itself gets the full body height.
  const body = document.createElement('div')
  body.style.cssText = 'display:none;flex-direction:column;padding:2px 6px 6px;position:relative'

  // Display canvas. Backing dimensions are kept in sync with the
  // actual rendered CSS box via ResizeObserver — same pattern as
  // `stats-graph.ts`. Without this, the bitmap stays at its initial
  // 240×96 intrinsic size and (depending on the parent layout) ends up
  // displayed unscaled in the upper-left of a stretched-CSS box.
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_WIDTH
  canvas.height = THUMB_HEIGHT
  canvas.style.cssText = `display:block;width:100%;height:${THUMB_HEIGHT}px;background:rgba(0,2,28,0.45);border-radius:2px;image-rendering:pixelated`

  // Off-screen canvas, sized per source bitmap. Used to materialise
  // `putImageData` once per frame; we then `drawImage` it onto the
  // display canvas with an aspect-correct destination rect.
  const offscreen = document.createElement('canvas')
  offscreen.width = 1
  offscreen.height = 1

  // Bottom-left overlay: dimensions + pixel format. Same translucent
  // chip background as the FPS-graph value badge so the text stays
  // legible regardless of the buffer's content underneath.
  const valueLabel = document.createElement('span')
  valueLabel.style.cssText = [
    'position:absolute',
    'left:10px',
    'bottom:10px',
    'padding:1px 4px',
    'font-size:10px',
    'background:rgba(0,2,28,0.65)',
    'border-radius:2px',
    'color:var(--tp-monitor-foreground-color)',
    'opacity:0.85',
    'font-family:var(--tp-base-font-family, ui-monospace, monospace)',
    'font-variant-numeric:tabular-nums',
    'pointer-events:none',
  ].join(';')

  // Bottom-right overlay: expand-to-fullscreen button.
  const expandBtn = document.createElement('span')
  expandBtn.textContent = '⤢'
  expandBtn.setAttribute('role', 'button')
  expandBtn.setAttribute('aria-label', 'Open fullscreen buffer viewer')
  expandBtn.title = 'Open fullscreen buffer viewer'
  expandBtn.style.cssText = [
    'position:absolute',
    'right:10px',
    'bottom:10px',
    'padding:1px 4px',
    'font-size:11px',
    'background:rgba(0,2,28,0.65)',
    'border-radius:2px',
    'cursor:pointer',
    'color:var(--tp-monitor-foreground-color)',
    'user-select:none',
    '-webkit-user-select:none',
  ].join(';')

  body.appendChild(canvas)
  body.appendChild(valueLabel)
  body.appendChild(expandBtn)

  bladeEl.appendChild(header)
  bladeEl.appendChild(body)

  // ── State ─────────────────────────────────────────────────────────────

  let collapsed = true
  let activeName: string | null = null
  let lastRenderedVersion = -1
  const ctx = canvas.getContext('2d')

  // Cached ImageData reused across paints when dimensions match — without
  // this, `createImageData(w, h)` allocates a fresh Uint8ClampedArray
  // (~w*h*4 bytes) every frame, ~400 KB/s of throwaway garbage at 4 Hz
  // for a 256×96 thumb.
  let cachedImgData: ImageData | null = null
  let cachedImgDataW = 0
  let cachedImgDataH = 0

  // Keep the canvas backing locked to its actual rendered pixel size so
  // `drawImage(0,0,canvas.width,canvas.height)` truly fills what the
  // user sees. Re-render the active buffer on resize so a freshly-
  // expanded blade isn't stuck on a stale stretched bitmap.
  const resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    const dpr = window.devicePixelRatio || 1
    const cssW = Math.max(1, Math.round(entry.contentRect.width))
    const cssH = Math.max(1, Math.round(entry.contentRect.height))
    const w = Math.max(1, Math.round(cssW * dpr))
    const h = Math.max(1, Math.round(cssH * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      lastRenderedVersion = -1 // force a redraw at the new backing size
      const cur = activeName !== null ? client.state.buffers.get(activeName) : undefined
      if (cur && !collapsed) renderThumb(cur)
    }
  })
  resizeObserver.observe(canvas)

  function currentNames(): string[] {
    return Array.from(client.state.buffers.keys())
  }

  function syncSelection(): void {
    if (collapsed || activeName === null) {
      client.setBuffers([])
      return
    }
    client.setBuffers([activeName])
  }

  function setActive(name: string | null): void {
    if (activeName === name) return
    activeName = name
    nameLabel.textContent = name ?? '—'
    lastRenderedVersion = -1
    syncSelection()
  }

  function cycle(delta: number): void {
    const names = currentNames()
    if (names.length === 0) return
    const idx = activeName === null ? -1 : names.indexOf(activeName)
    const next = names[(idx + delta + names.length) % names.length]!
    setActive(next)
  }

  const toggleCollapse = (e: Event): void => {
    e.stopPropagation()
    collapsed = !collapsed
    body.style.display = collapsed ? 'none' : 'flex'
    if (!collapsed) lastRenderedVersion = -1
    syncSelection()
  }
  header.addEventListener('click', toggleCollapse)
  prevBtn.addEventListener('click', (e) => { e.stopPropagation(); cycle(-1) })
  nextBtn.addEventListener('click', (e) => { e.stopPropagation(); cycle(1) })
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (activeName !== null && options.onExpand !== undefined) {
      options.onExpand(activeName)
    }
  })

  // ── Render ────────────────────────────────────────────────────────────

  /**
   * Paint the latest sample for the currently-selected buffer into the
   * thumbnail. Float kinds are clamped to [0,1] for the preview;
   * proper min-max tonemap lives in the fullscreen viewer (TBD).
   *
   * Pipeline:
   *   1. Decode the typed-array sample into RGBA8 inside `offscreen`
   *      (sized to match the source — 256×4, 64×64, etc.).
   *   2. Clear the display canvas.
   *   3. Compute an aspect-correct destination rect inside the display
   *      canvas (THUMB_WIDTH × THUMB_HEIGHT) and `drawImage` into it.
   *
   * Disabling `imageSmoothingEnabled` keeps the upscale crisp instead
   * of bilinear-blurry — matches the "image-rendering: pixelated" hint.
   */
  function renderThumb(entry: BufferSnapshot): void {
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const { width, height, pixels } = entry
    if (width === 0 || height === 0 || pixels === null) return

    if (offscreen.width !== width || offscreen.height !== height) {
      offscreen.width = width
      offscreen.height = height
      // Backing dims changed → invalidate the ImageData cache.
      cachedImgData = null
    }
    const offCtx = offscreen.getContext('2d')
    if (!offCtx) return

    if (cachedImgData === null || cachedImgDataW !== width || cachedImgDataH !== height) {
      cachedImgData = offCtx.createImageData(width, height)
      cachedImgDataW = width
      cachedImgDataH = height
    }
    const imgData = cachedImgData
    const out = imgData.data

    // Pixels arrive as display-ready RGBA8 from the worker — copy
    // directly into the ImageData without any decoder logic.
    if (pixels instanceof Uint8Array) {
      out.set(pixels.subarray(0, out.length))
    } else {
      // Float32Array fallback (shouldn't happen post-pipeline, but
      // guard against legacy callers).
      const count = width * height
      for (let i = 0; i < count; i++) {
        const o = i * 4
        out[o]     = Math.round(Math.max(0, Math.min(1, pixels[i * 4]     ?? 0)) * 255)
        out[o + 1] = Math.round(Math.max(0, Math.min(1, pixels[i * 4 + 1] ?? 0)) * 255)
        out[o + 2] = Math.round(Math.max(0, Math.min(1, pixels[i * 4 + 2] ?? 0)) * 255)
        out[o + 3] = Math.round(Math.max(0, Math.min(1, pixels[i * 4 + 3] ?? 1)) * 255)
      }
    }

    offCtx.putImageData(imgData, 0, 0)

    // Stretch to fill: every source pixel maps somewhere in the
    // viewport. This deliberately distorts (a 256×4 buffer reads as
    // 4 stretched rows across the full panel) but guarantees you can
    // SEE every value in a debug thumbnail. Aspect-correct inspection
    // belongs in the fullscreen viewer.
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height)
  }

  // ── Listener ──────────────────────────────────────────────────────────

  const unsubscribe = client.addListener((state) => {
    const names = Array.from(state.buffers.keys())

    // Visibility.
    bladeEl.style.display = names.length > 0 ? 'flex' : 'none'

    // Establish/repair active selection.
    if (names.length === 0) {
      setActive(null)
    } else if (activeName === null || !names.includes(activeName)) {
      setActive(names[0]!)
    }

    // Arrow affordance.
    const multi = names.length > 1
    prevBtn.style.opacity = multi ? '0.8' : '0.25'
    nextBtn.style.opacity = multi ? '0.8' : '0.25'
    prevBtn.style.cursor = multi ? 'pointer' : 'default'
    nextBtn.style.cursor = multi ? 'pointer' : 'default'

    // Ensure the provider is streaming the current selection (new
    // entries appearing while we're expanded should auto-subscribe).
    syncSelection()

    // Paint.
    if (collapsed || activeName === null) return
    const entry = state.buffers.get(activeName)
    if (!entry) return
    if (entry.version === lastRenderedVersion) return
    lastRenderedVersion = entry.version
    renderThumb(entry)
    valueLabel.textContent = `${entry.width}×${entry.height} · ${entry.pixelType}`
    nameLabel.title = `${entry.name}${entry.label ? ` — ${entry.label}` : ''}`
  })

  return {
    element: bladeEl,
    dispose() {
      resizeObserver.disconnect()
      unsubscribe()
      blade.dispose()
    },
  }
}

