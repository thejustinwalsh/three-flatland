/**
 * Fullscreen buffer viewer.
 *
 * Lives outside the Tweakpane DOM tree — mounts a top-level
 * `<div>` to `document.body` with a high `z-index`, fully blocks
 * interaction with the host page until closed. Layout:
 *
 *   ┌───────────────────────────────────────────┐
 *   │ ◀ tree │                          ⤡ × │   ← header bar
 *   │────────│                                │
 *   │ group1 │            canvas              │
 *   │  • a   │     (aspect-correct)           │
 *   │  • b   │                                │
 *   │ group2 │                                │
 *   │  • c   │                                │
 *   │        │                                │
 *   └───────────────────────────────────────────┘
 *
 * Sidebar (defaults expanded, collapsible via the ◀ at the top-left):
 *   - Group tree: every registered buffer, grouped by `name` prefix.
 *   - Click a buffer to make it active. Active row highlighted.
 *
 * Main area:
 *   - Canvas sized to fill remaining space, source bitmap rendered
 *     aspect-correct (`object-fit: contain` semantics) with the same
 *     decoder pipeline as the in-pane thumbnail.
 *   - Header chips: dimensions, pixel type, display mode.
 *   - `×` button (top-right) closes; `Esc` also closes; outer-click
 *     does not close (modal is intentionally sticky to avoid
 *     accidental dismiss while inspecting).
 *
 * Selection drives `client.setBuffers([activeName])` so only the
 * one buffer the user is looking at gets streamed. Closing the
 * modal restores whatever the in-pane thumbnail's selection was.
 */

import type { BufferChunkPayload, BufferSnapshot, DevtoolsClient } from './devtools-client.js'

export interface BuffersModalHandle {
  /** Show the modal with the given buffer pre-selected. */
  open(name: string): void
  /** Close it (no-op if already closed). */
  close(): void
  /** True when visible. */
  readonly isOpen: boolean
  /** Tear down DOM + listener. */
  dispose(): void
}

/**
 * Build a fullscreen modal anchored to `document.body`. Returns an
 * imperative handle — the in-pane thumbnail's expand button calls
 * `open(activeName)` to surface it.
 */
export function createBuffersModal(client: DevtoolsClient): BuffersModalHandle {
  // ── Root + overlay ────────────────────────────────────────────────────

  const root = document.createElement('div')
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:99999',
    'background:rgba(0,2,28,0.92)',
    'color:var(--tp-label-foreground-color, #f0edd8)',
    'font-family:var(--tp-base-font-family, ui-monospace, monospace)',
    'font-size:12px',
    'display:none',
    'flex-direction:column',
  ].join(';')

  // ── Header bar ────────────────────────────────────────────────────────

  const header = document.createElement('div')
  header.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:12px',
    'padding:8px 12px',
    'border-bottom:1px solid rgba(240,237,216,0.08)',
    'flex:0 0 auto',
  ].join(';')

  const sidebarToggle = document.createElement('span')
  sidebarToggle.textContent = '◀'
  sidebarToggle.style.cssText = 'cursor:pointer;padding:2px 6px;opacity:0.8;user-select:none'
  sidebarToggle.title = 'Toggle sidebar'

  const titleEl = document.createElement('span')
  titleEl.style.cssText = 'flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'

  const dimsEl = document.createElement('span')
  dimsEl.style.cssText = 'opacity:0.7;font-variant-numeric:tabular-nums'

  const closeBtn = document.createElement('span')
  closeBtn.textContent = '×'
  closeBtn.style.cssText = 'cursor:pointer;padding:2px 10px;font-size:18px;line-height:1;opacity:0.8;user-select:none'
  closeBtn.title = 'Close'

  header.appendChild(sidebarToggle)
  header.appendChild(titleEl)
  header.appendChild(dimsEl)
  header.appendChild(closeBtn)

  // ── Body: sidebar + main ──────────────────────────────────────────────

  const body = document.createElement('div')
  body.style.cssText = 'display:flex;flex:1;min-height:0'

  const sidebar = document.createElement('div')
  sidebar.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'width:240px',
    'border-right:1px solid rgba(240,237,216,0.08)',
    'overflow-y:auto',
    'padding:8px 0',
    'flex:0 0 auto',
  ].join(';')

  const main = document.createElement('div')
  main.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;padding:16px;min-width:0;min-height:0'

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;background:rgba(0,2,28,0.6);border-radius:4px;image-rendering:pixelated;max-width:100%;max-height:100%'
  const ctx = canvas.getContext('2d')

  const offscreen = document.createElement('canvas')
  offscreen.width = 1
  offscreen.height = 1

  main.appendChild(canvas)
  body.appendChild(sidebar)
  body.appendChild(main)

  root.appendChild(header)
  root.appendChild(body)
  document.body.appendChild(root)

  // ── State ─────────────────────────────────────────────────────────────

  let isOpen = false
  let activeName: string | null = null
  let lastRenderedVersion = -1
  let sidebarCollapsed = false

  // ── Pan + zoom ─────────────────────────────────────────────────────────

  let zoom = 1
  let panX = 0
  let panY = 0
  let isDragging = false
  let dragStartX = 0
  let dragStartY = 0
  let panStartX = 0
  let panStartY = 0

  function applyTransform(): void {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`
    canvas.style.transformOrigin = 'center center'
  }

  function resetTransform(): void {
    zoom = 1
    panX = 0
    panY = 0
    applyTransform()
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const newZoom = Math.max(0.1, Math.min(50, zoom * factor))

    // Zoom toward cursor position relative to canvas center
    const rect = canvas.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx - panX
    const dy = e.clientY - cy - panY
    const scale = newZoom / zoom

    panX = e.clientX - cx - dx * scale
    panY = e.clientY - cy - dy * scale
    zoom = newZoom
    applyTransform()
  }, { passive: false })

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    isDragging = true
    dragStartX = e.clientX
    dragStartY = e.clientY
    panStartX = panX
    panStartY = panY
    canvas.style.cursor = 'grabbing'
  })

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    panX = panStartX + (e.clientX - dragStartX)
    panY = panStartY + (e.clientY - dragStartY)
    applyTransform()
  })

  window.addEventListener('mouseup', () => {
    if (!isDragging) return
    isDragging = false
    canvas.style.cursor = 'grab'
  })

  canvas.style.cursor = 'grab'

  // Track the per-row DOM nodes so we can update highlight without
  // re-rendering the whole sidebar each batch.
  const rowEls = new Map<string, HTMLDivElement>()

  // ── Sidebar render ────────────────────────────────────────────────────

  const groupContainers = new Map<string, HTMLDivElement>()

  function ensureGroup(group: string): HTMLDivElement {
    let el = groupContainers.get(group)
    if (el !== undefined) return el
    el = document.createElement('div')
    el.style.cssText = 'margin:6px 0'
    const head = document.createElement('div')
    head.textContent = group
    head.style.cssText = 'padding:4px 12px;opacity:0.6;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;user-select:none'
    el.appendChild(head)
    sidebar.appendChild(el)
    groupContainers.set(group, el)
    return el
  }

  function ensureRow(group: string, name: string, shortName: string): HTMLDivElement {
    let row = rowEls.get(name)
    if (row !== undefined) return row
    const groupEl = ensureGroup(group)
    row = document.createElement('div')
    row.textContent = shortName
    row.dataset['name'] = name
    row.style.cssText = 'padding:4px 12px 4px 22px;cursor:pointer;user-select:none;border-left:2px solid transparent'
    row.addEventListener('click', () => setActive(name))
    groupEl.appendChild(row)
    rowEls.set(name, row)
    return row
  }

  function destroyRow(name: string): void {
    const row = rowEls.get(name)
    if (row === undefined) return
    row.remove()
    rowEls.delete(name)
  }

  function highlightActive(): void {
    for (const [name, row] of rowEls) {
      const on = name === activeName
      row.style.background = on ? 'rgba(71,204,169,0.15)' : 'transparent'
      row.style.borderLeftColor = on ? 'var(--tp-button-foreground-color-active, #47cca9)' : 'transparent'
      row.style.color = on ? 'var(--tp-label-foreground-color, #f0edd8)' : 'rgba(240,237,216,0.7)'
    }
  }

  // ── Render the active buffer into the canvas ──────────────────────────

  function paint(snap: BufferSnapshot): void {
    if (ctx === null) return
    const { width, height, pixelType, pixels, display } = snap
    if (width === 0 || height === 0 || pixels === null) {
      // Size canvas to a placeholder so it still occupies space.
      canvas.width = 1; canvas.height = 1
      return
    }

    if (offscreen.width !== width || offscreen.height !== height) {
      offscreen.width = width
      offscreen.height = height
    }
    const offCtx = offscreen.getContext('2d')
    if (offCtx === null) return

    const imgData = offCtx.createImageData(width, height)
    const out = imgData.data
    const count = width * height
    const stride = pixelType === 'r8' ? 1 : 4

    if (display === 'colors') {
      decodeColors(pixels, out, count, stride)
    } else if (display === 'mono') {
      decodeMono(pixels, out, count, stride)
    } else if (display === 'signed') {
      decodeSigned(pixels, out, count, stride)
    } else {
      decodeNormalize(pixels, out, count, stride)
    }
    offCtx.putImageData(imgData, 0, 0)

    // Aspect-fit into the available main area. We size the visible
    // canvas to the source aspect ratio, capped by the container's
    // box, then drawImage 1:1.
    const mainRect = main.getBoundingClientRect()
    const maxW = mainRect.width - 32
    const maxH = mainRect.height - 32
    const srcAspect = width / height
    const boxAspect = maxW / maxH
    let cssW: number
    let cssH: number
    if (srcAspect > boxAspect) {
      cssW = maxW
      cssH = Math.max(1, Math.round(maxW / srcAspect))
    } else {
      cssH = maxH
      cssW = Math.max(1, Math.round(maxH * srcAspect))
    }
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    // Backing matches displayed pixels at 1:1 (no DPR mul — modal is
    // about inspection, not pretty rendering, and 1:1 keeps the
    // pixel grid clearly visible).
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(offscreen, 0, 0)
  }

  function refresh(): void {
    if (!isOpen) return
    const state = client.state

    // Sync the sidebar tree.
    const present = new Set<string>()
    for (const [name] of state.buffers) {
      present.add(name)
      const dot = name.indexOf('.')
      const group = dot === -1 ? 'ungrouped' : name.slice(0, dot)
      const short = dot === -1 ? name : name.slice(dot + 1)
      ensureRow(group, name, short)
    }
    for (const name of rowEls.keys()) {
      if (!present.has(name)) destroyRow(name)
    }

    // If active was removed, fall back to first available.
    if (activeName !== null && !state.buffers.has(activeName)) {
      const first = state.buffers.keys().next().value as string | undefined
      activeName = first ?? null
      // setActive resyncs server filter, but we may be in mid-refresh
      // so call the underlying setter directly.
      if (activeName !== null) client.setBuffers([activeName])
      else client.setBuffers([])
    }
    highlightActive()

    if (activeName === null) {
      titleEl.textContent = '—'
      dimsEl.textContent = ''
      return
    }
    const snap = state.buffers.get(activeName)
    if (snap === undefined) return
    titleEl.textContent = snap.label !== undefined ? `${activeName} — ${snap.label}` : activeName
    dimsEl.textContent = `${snap.width}×${snap.height} · ${snap.pixelType} · ${snap.display}`
    if (snap.version !== lastRenderedVersion) {
      lastRenderedVersion = snap.version
      paint(snap)
    }
  }

  function setActive(name: string): void {
    if (activeName === name) return
    activeName = name
    lastRenderedVersion = -1
    resetTransform()
    client.setBuffers([name])
    highlightActive()
    refresh()
  }

  // ── Event wiring ──────────────────────────────────────────────────────

  const unsubscribe = client.addListener(() => refresh())

  closeBtn.addEventListener('click', () => close())
  sidebarToggle.addEventListener('click', () => {
    sidebarCollapsed = !sidebarCollapsed
    sidebar.style.display = sidebarCollapsed ? 'none' : 'flex'
    sidebarToggle.textContent = sidebarCollapsed ? '▶' : '◀'
    refresh()
  })
  const onKeydown = (e: KeyboardEvent) => {
    if (!isOpen) return
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKeydown)

  // Re-paint on viewport resize so the canvas re-fits its container.
  const onResize = () => {
    if (!isOpen || activeName === null) return
    const snap = client.state.buffers.get(activeName)
    if (snap !== undefined) paint(snap)
  }
  window.addEventListener('resize', onResize)

  // ── Open / close ──────────────────────────────────────────────────────

  // ── WebCodecs decoder ─────────────────────────────────────────────────

  const codecAvailable = typeof VideoDecoder !== 'undefined'
  let decoder: VideoDecoder | null = null
  let unsubChunks: (() => void) | null = null
  let waitingForKeyFrame = true

  function startDecoder(width: number, height: number): void {
    stopDecoder()
    if (!codecAvailable) return
    waitingForKeyFrame = true
    decoder = new VideoDecoder({
      output: (frame) => {
        if (ctx === null) { frame.close(); return }
        // Aspect-fit into the main area
        const mainRect = main.getBoundingClientRect()
        const maxW = mainRect.width - 32
        const maxH = mainRect.height - 32
        const srcAspect = frame.codedWidth / frame.codedHeight
        const boxAspect = maxW / maxH
        let cssW: number, cssH: number
        if (srcAspect > boxAspect) {
          cssW = maxW
          cssH = Math.max(1, Math.round(maxW / srcAspect))
        } else {
          cssH = maxH
          cssW = Math.max(1, Math.round(maxH * srcAspect))
        }
        canvas.style.width = `${cssW}px`
        canvas.style.height = `${cssH}px`
        if (canvas.width !== frame.codedWidth || canvas.height !== frame.codedHeight) {
          canvas.width = frame.codedWidth
          canvas.height = frame.codedHeight
        }
        ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0)
        frame.close()
      },
      error: () => {
        stopDecoder()
      },
    })
    decoder.configure({
      codec: 'vp09.00.10.08',
      codedWidth: width,
      codedHeight: height,
    })
  }

  function stopDecoder(): void {
    if (decoder !== null && decoder.state !== 'closed') {
      try { decoder.close() } catch { /* may already be errored */ }
    }
    decoder = null
    waitingForKeyFrame = true
  }

  let decoderWidth = 0
  let decoderHeight = 0

  function onChunk(chunk: BufferChunkPayload): void {
    if (!isOpen) return
    if (chunk.name !== activeName) return

    // Start or reconfigure decoder on dimension change
    if (decoder === null || chunk.width !== decoderWidth || chunk.height !== decoderHeight) {
      decoderWidth = chunk.width
      decoderHeight = chunk.height
      startDecoder(chunk.width, chunk.height)
    }
    if (decoder === null) return

    if (waitingForKeyFrame && !chunk.keyFrame) return
    if (chunk.keyFrame) waitingForKeyFrame = false

    try {
      const encoded = new EncodedVideoChunk({
        type: chunk.keyFrame ? 'key' : 'delta',
        timestamp: chunk.capturedAt * 1000,
        data: chunk.data,
      })
      decoder.decode(encoded)
    } catch {
      stopDecoder()
    }
  }

  // ── Open / close ──────────────────────────────────────────────────────

  function open(name: string): void {
    if (isOpen && activeName === name) return
    isOpen = true
    root.style.display = 'flex'
    setActive(name)
    // Start streaming via WebCodecs if available
    if (codecAvailable) {
      client.setBuffers([name], true)
      unsubChunks = client.addChunkListener(onChunk)
    }
  }

  function close(): void {
    if (!isOpen) return
    isOpen = false
    root.style.display = 'none'
    stopDecoder()
    if (unsubChunks !== null) {
      unsubChunks()
      unsubChunks = null
    }
    // Revert to non-stream mode
    client.setBuffers(activeName !== null ? [activeName] : [])
  }

  return {
    get isOpen(): boolean { return isOpen },
    open,
    close,
    dispose() {
      stopDecoder()
      if (unsubChunks !== null) {
        unsubChunks()
        unsubChunks = null
      }
      unsubscribe()
      document.removeEventListener('keydown', onKeydown)
      window.removeEventListener('resize', onResize)
      root.remove()
      rowEls.clear()
      groupContainers.clear()
    },
  }
}

// ── Decoders (duplicated from buffers-view.ts to keep the modal
//    self-contained; identical logic). If we ever need a third
//    consumer we can promote them to a shared module.

type Pixels = Uint8Array | Float32Array

function clamp01to255(v: number): number {
  if (v <= 0) return 0
  if (v >= 1) return 255
  return Math.round(v * 255)
}

function decodeColors(src: Pixels, out: Uint8ClampedArray, count: number, stride: number): void {
  if (src instanceof Uint8Array) {
    if (stride === 1) {
      for (let i = 0; i < count; i++) {
        const v = src[i] ?? 0
        const o = i * 4
        out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255
      }
    } else {
      const n = Math.min(src.length, out.length)
      for (let i = 0; i < n; i++) out[i] = src[i]!
    }
    return
  }
  if (stride === 1) {
    for (let i = 0; i < count; i++) {
      const v = clamp01to255(src[i] ?? 0)
      const o = i * 4
      out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255
    }
  } else {
    for (let i = 0; i < count; i++) {
      const o = i * 4
      out[o] = clamp01to255(src[i * 4] ?? 0)
      out[o + 1] = clamp01to255(src[i * 4 + 1] ?? 0)
      out[o + 2] = clamp01to255(src[i * 4 + 2] ?? 0)
      const a = src[i * 4 + 3]
      out[o + 3] = a === undefined ? 255 : clamp01to255(a)
    }
  }
}

function decodeNormalize(src: Pixels, out: Uint8ClampedArray, count: number, stride: number): void {
  if (stride === 1) {
    let mn = Infinity, mx = -Infinity
    for (let i = 0; i < count; i++) {
      const v = (src as Pixels)[i] ?? 0
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    const span = mx - mn || 1
    for (let i = 0; i < count; i++) {
      const v = (src as Pixels)[i] ?? 0
      const b = Math.round(((v - mn) / span) * 255)
      const o = i * 4
      out[o] = b; out[o + 1] = b; out[o + 2] = b; out[o + 3] = 255
    }
    return
  }
  let rMn = Infinity, rMx = -Infinity
  let gMn = Infinity, gMx = -Infinity
  let bMn = Infinity, bMx = -Infinity
  for (let i = 0; i < count; i++) {
    const r = src[i * 4] ?? 0
    const g = src[i * 4 + 1] ?? 0
    const b = src[i * 4 + 2] ?? 0
    if (r < rMn) rMn = r; if (r > rMx) rMx = r
    if (g < gMn) gMn = g; if (g > gMx) gMx = g
    if (b < bMn) bMn = b; if (b > bMx) bMx = b
  }
  const rSpan = rMx - rMn || 1
  const gSpan = gMx - gMn || 1
  const bSpan = bMx - bMn || 1
  for (let i = 0; i < count; i++) {
    const r = src[i * 4] ?? 0
    const g = src[i * 4 + 1] ?? 0
    const b = src[i * 4 + 2] ?? 0
    const o = i * 4
    out[o] = Math.round(((r - rMn) / rSpan) * 255)
    out[o + 1] = Math.round(((g - gMn) / gSpan) * 255)
    out[o + 2] = Math.round(((b - bMn) / bSpan) * 255)
    out[o + 3] = 255
  }
}

function decodeMono(src: Pixels, out: Uint8ClampedArray, count: number, stride: number): void {
  let mn = Infinity, mx = -Infinity
  for (let i = 0; i < count; i++) {
    const v = stride === 1 ? (src[i] ?? 0) : (src[i * 4] ?? 0)
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const span = mx - mn || 1
  for (let i = 0; i < count; i++) {
    const v = stride === 1 ? (src[i] ?? 0) : (src[i * 4] ?? 0)
    const b = Math.round(((v - mn) / span) * 255)
    const o = i * 4
    out[o] = b; out[o + 1] = b; out[o + 2] = b; out[o + 3] = 255
  }
}

function decodeSigned(src: Pixels, out: Uint8ClampedArray, count: number, stride: number): void {
  let absMax = 0
  for (let i = 0; i < count; i++) {
    const v = stride === 1 ? (src[i] ?? 0) : (src[i * 4] ?? 0)
    const a = v < 0 ? -v : v
    if (a > absMax) absMax = a
  }
  const range = absMax || 1
  for (let i = 0; i < count; i++) {
    const v = stride === 1 ? (src[i] ?? 0) : (src[i * 4] ?? 0)
    const t = v / range
    const o = i * 4
    if (t >= 0) {
      out[o] = Math.round(128 + 127 * t)
      out[o + 1] = 128 - Math.round(64 * t)
      out[o + 2] = 128 - Math.round(64 * t)
    } else {
      out[o] = 128 - Math.round(64 * (-t))
      out[o + 1] = Math.round(128 + 127 * (-t))
      out[o + 2] = 128 - Math.round(64 * (-t))
    }
    out[o + 3] = 255
  }
}
