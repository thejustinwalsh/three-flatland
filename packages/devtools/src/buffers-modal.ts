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
  main.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;padding:16px;min-width:0;min-height:0;overflow:hidden;position:relative'

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;background:rgba(0,2,28,0.6);image-rendering:pixelated;max-width:100%;max-height:100%'
  const ctx = canvas.getContext('2d')

  const offscreen = document.createElement('canvas')
  offscreen.width = 1
  offscreen.height = 1

  // Zoom info + reset — top-left to avoid conflict with docs page controls
  const zoomBar = document.createElement('div')
  zoomBar.style.cssText = [
    'position:absolute', 'top:8px', 'left:8px',
    'display:flex', 'gap:6px', 'align-items:center',
    'z-index:1',
  ].join(';')

  const zoomInfo = document.createElement('span')
  zoomInfo.style.cssText = [
    'padding:3px 8px', 'border-radius:4px',
    'background:rgba(0,0,0,0.6)', 'color:#aaa',
    'font:11px/1.4 monospace', 'pointer-events:none',
    'user-select:none',
  ].join(';')
  zoomInfo.textContent = '1.0×'

  const resetBtn = document.createElement('span')
  resetBtn.style.cssText = [
    'padding:3px 8px', 'border-radius:4px',
    'background:rgba(0,0,0,0.6)', 'color:#aaa',
    'font:11px/1.4 monospace', 'cursor:pointer',
    'user-select:none',
  ].join(';')
  resetBtn.textContent = '⟲ Reset'
  resetBtn.title = 'Reset zoom & pan (double-click also resets)'

  zoomBar.appendChild(zoomInfo)
  zoomBar.appendChild(resetBtn)

  main.appendChild(canvas)
  main.appendChild(zoomBar)
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

  const MIN_ZOOM = 0.25
  const MAX_ZOOM = 64

  let zoom = 1
  let panX = 0
  let panY = 0
  let isDragging = false
  let dragStartX = 0
  let dragStartY = 0
  let panStartX = 0
  let panStartY = 0

  function updateZoomInfo(): void {
    const z = zoom < 10 ? zoom.toFixed(1) : Math.round(zoom).toString()
    zoomInfo.textContent = zoom === 1 ? '1.0×' : `${z}× · (${Math.round(panX)}, ${Math.round(panY)})`
    const atIdentity = zoom === 1 && panX === 0 && panY === 0
    resetBtn.style.display = atIdentity ? 'none' : 'inline'
  }

  function applyTransform(): void {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`
    canvas.style.transformOrigin = 'center center'
    updateZoomInfo()
  }

  function resetTransform(): void {
    zoom = 1
    panX = 0
    panY = 0
    applyTransform()
  }

  // Prevent page scroll when pointer is over the main area
  main.addEventListener('wheel', (e) => {
    e.preventDefault()
    e.stopPropagation()

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor))
    if (newZoom === zoom) return

    // Zoom toward cursor position
    const rect = main.getBoundingClientRect()
    const mx = e.clientX - rect.left - rect.width / 2
    const my = e.clientY - rect.top - rect.height / 2
    const ratio = 1 - newZoom / zoom
    panX += (mx - panX) * ratio
    panY += (my - panY) * ratio
    zoom = newZoom
    applyTransform()
  }, { passive: false })

  main.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    isDragging = true
    dragStartX = e.clientX
    dragStartY = e.clientY
    panStartX = panX
    panStartY = panY
    main.style.cursor = 'grabbing'
    e.preventDefault()
  })

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return
    panX = panStartX + (e.clientX - dragStartX)
    panY = panStartY + (e.clientY - dragStartY)
    applyTransform()
  }

  const onMouseUp = () => {
    if (!isDragging) return
    isDragging = false
    main.style.cursor = 'grab'
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)

  main.addEventListener('dblclick', () => resetTransform())
  resetBtn.addEventListener('click', () => resetTransform())

  main.style.cursor = 'grab'

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
    const { width, height, pixels } = snap
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
    // In stream mode the VideoDecoder draws directly to the canvas —
    // don't let paint() overwrite it (pixels are stripped from the
    // batch so snap.pixels is null, which would clear the canvas).
    if (decoder === null && snap.version !== lastRenderedVersion) {
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
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      root.remove()
      rowEls.clear()
      groupContainers.clear()
    },
  }
}

