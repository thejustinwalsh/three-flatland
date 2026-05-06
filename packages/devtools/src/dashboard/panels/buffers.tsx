/** @jsxImportSource preact */
/**
 * Buffers panel — live preview of registered debug textures.
 *
 * Same transport as the Tweakpane modal: when an entry is selected the
 * panel subscribes in `stream` mode so the provider ships VP9-encoded
 * frames through the worker. Decoded frames draw into a canvas which
 * aspect-fits to the available main area and rescales on ResizeObserver.
 *
 * Thumbnail mode (downsampled `buffer:raw` payloads) is used as a fast
 * fallback when WebCodecs isn't available — the worker converts to RGBA8
 * and the panel paints via putImageData. Both paths share `fitCanvas`
 * so CSS sizing stays consistent across the mode switch.
 *
 * Multiple dashboard consumers (or the tweakpane modal) subscribing to
 * different entries is fine — the producer unions selections server-side.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { BufferChunkPayload } from '../../devtools-client.js'
import { getClient } from '../client.js'
import { useDevtoolsState } from '../hooks.js'

const VP9_CODEC = 'vp09.00.10.08'
const CODEC_AVAILABLE = typeof globalThis.VideoDecoder !== 'undefined'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 64

interface PixelProbe {
  x: number
  y: number
  r: number
  g: number
  b: number
  a: number
}

export function BuffersPanel() {
  const state = useDevtoolsState()
  const client = getClient()
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [probe, setProbe] = useState<PixelProbe | null>(null)
  const dragStateRef = useRef<{ active: boolean; startX: number; startY: number; panX: number; panY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  })

  // Stable sorted buffer list.
  const entries = useMemo(() => {
    const arr = Array.from(state.buffers.values())
    arr.sort((a, b) => a.name.localeCompare(b.name))
    return arr
  }, [state.buffers, state.buffers.size])

  const needle = filter.trim().toLowerCase()
  const visible = needle.length > 0
    ? entries.filter((e) => e.name.toLowerCase().includes(needle) || (e.label?.toLowerCase().includes(needle) ?? false))
    : entries

  // Only clear the selection if the currently-selected name has
  // vanished from the registry. Never auto-pick — selection must be
  // explicit so we don't silently subscribe a producer in stream mode
  // the moment a buffer shows up. Unselected = nothing streaming, no
  // GPU readback or VP9 encode on the producer side.
  const effectiveSelected = selectedName !== null && visible.some((e) => e.name === selectedName)
    ? selectedName
    : null

  // Subscribe/unsubscribe to stream mode based on selection. The dashboard
  // is a fresh DevtoolsClient consumer so this subscription is additive
  // to whatever the tweakpane pane happens to want — the provider unions
  // selections across consumers.
  useEffect(() => {
    if (effectiveSelected === null) {
      client.setBuffers({})
      return
    }
    client.setBuffers({ [effectiveSelected]: { mode: 'stream' } })
    return () => { client.setBuffers({}) }
  }, [client, effectiveSelected])

  // WebCodecs decoder lifecycle — one instance per active selection.
  // We keep decoder state in refs (not component state) because it's
  // imperative by nature and should not trigger re-renders.
  const decoderRef = useRef<VideoDecoder | null>(null)
  const decoderDimsRef = useRef({ w: 0, h: 0 })
  const waitingForKeyFrameRef = useRef(true)
  const canvasSrcRef = useRef({ w: 0, h: 0 })

  const fitCanvas = (srcW: number, srcH: number): void => {
    const canvas = canvasRef.current
    const main = mainRef.current
    if (canvas === null || main === null || srcW <= 0 || srcH <= 0) return
    const rect = main.getBoundingClientRect()
    const maxW = Math.max(1, rect.width - 16)
    const maxH = Math.max(1, rect.height - 16)
    const srcAspect = srcW / srcH
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
  }

  const stopDecoder = (): void => {
    const d = decoderRef.current
    if (d !== null && d.state !== 'closed') {
      try { d.close() } catch { /* may already be errored */ }
    }
    decoderRef.current = null
    decoderDimsRef.current = { w: 0, h: 0 }
    waitingForKeyFrameRef.current = true
  }

  const startDecoder = (w: number, h: number): void => {
    stopDecoder()
    if (!CODEC_AVAILABLE) return
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    waitingForKeyFrameRef.current = true
    const decoder = new globalThis.VideoDecoder({
      output: (frame) => {
        if (canvas.width !== frame.codedWidth || canvas.height !== frame.codedHeight) {
          canvas.width = frame.codedWidth
          canvas.height = frame.codedHeight
        }
        canvasSrcRef.current = { w: frame.codedWidth, h: frame.codedHeight }
        fitCanvas(frame.codedWidth, frame.codedHeight)
        ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0)
        frame.close()
      },
      error: () => {
        stopDecoder()
      },
    })
    decoder.configure({ codec: VP9_CODEC, codedWidth: w, codedHeight: h })
    decoderRef.current = decoder
    decoderDimsRef.current = { w, h }
  }

  // Wire chunk listener. Filters for the active selection; reconfigures
  // the decoder when the source dimensions change (common on resize of
  // the producer's render target).
  useEffect(() => {
    if (effectiveSelected === null) {
      stopDecoder()
      return
    }
    const activeName = effectiveSelected
    const unsub = client.addChunkListener((chunk: BufferChunkPayload) => {
      if (chunk.name !== activeName) return
      if (
        decoderRef.current === null ||
        chunk.width !== decoderDimsRef.current.w ||
        chunk.height !== decoderDimsRef.current.h
      ) {
        startDecoder(chunk.width, chunk.height)
      }
      const d = decoderRef.current
      if (d === null) return
      if (waitingForKeyFrameRef.current && !chunk.keyFrame) return
      if (chunk.keyFrame) waitingForKeyFrameRef.current = false
      try {
        const enc = new EncodedVideoChunk({
          type: chunk.keyFrame ? 'key' : 'delta',
          timestamp: chunk.capturedAt * 1000,
          data: chunk.data,
        })
        d.decode(enc)
      } catch {
        stopDecoder()
      }
    })
    return () => {
      unsub()
      stopDecoder()
    }
  }, [client, effectiveSelected])

  // Thumbnail fallback: when WebCodecs isn't available the worker sends
  // `buffer:raw` payloads which land on `state.buffers[name].pixels`.
  // Paint those when the stream path isn't decoding.
  useEffect(() => {
    if (CODEC_AVAILABLE) return
    if (effectiveSelected === null) return
    const snap = state.buffers.get(effectiveSelected)
    if (snap === undefined || snap.pixels === null) return
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    if (canvas.width !== snap.width || canvas.height !== snap.height) {
      canvas.width = snap.width
      canvas.height = snap.height
    }
    canvasSrcRef.current = {
      w: snap.srcWidth > 0 ? snap.srcWidth : snap.width,
      h: snap.srcHeight > 0 ? snap.srcHeight : snap.height,
    }
    fitCanvas(canvasSrcRef.current.w, canvasSrcRef.current.h)
    if (snap.pixels instanceof Uint8Array) {
      const img = ctx.createImageData(snap.width, snap.height)
      img.data.set(snap.pixels.subarray(0, img.data.length))
      ctx.putImageData(img, 0, 0)
    }
  }, [state.buffers, effectiveSelected])

  // Re-fit on layout changes (panel resize, sidebar collapse, etc.).
  useEffect(() => {
    const main = mainRef.current
    if (main === null) return
    const obs = new ResizeObserver(() => {
      const { w, h } = canvasSrcRef.current
      if (w > 0 && h > 0) fitCanvas(w, h)
    })
    obs.observe(main)
    return () => obs.disconnect()
  }, [])

  // Reset view when selection changes so each buffer opens 1:1 centered.
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setProbe(null)
  }, [effectiveSelected])

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const main = mainRef.current
    if (main === null) return
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor))
    if (nextZoom === zoom) return
    // Anchor zoom to the cursor: compute the canvas-space point under
    // the cursor, then adjust pan so that same point remains under it.
    const rect = main.getBoundingClientRect()
    const cx = e.clientX - rect.left - rect.width / 2
    const cy = e.clientY - rect.top - rect.height / 2
    const scale = nextZoom / zoom
    setPan({
      x: cx - (cx - pan.x) * scale,
      y: cy - (cy - pan.y) * scale,
    })
    setZoom(nextZoom)
  }

  const onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragStateRef.current.active) return
      setPan({
        x: dragStateRef.current.panX + (e.clientX - dragStateRef.current.startX),
        y: dragStateRef.current.panY + (e.clientY - dragStateRef.current.startY),
      })
    }
    const onUp = (): void => {
      dragStateRef.current.active = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Pixel probe: translate the cursor's screen-space position into the
  // canvas's backing-buffer coordinates, then `getImageData(1,1)` at
  // that point. Drawn into a tooltip overlay. Runs on every mousemove
  // over the canvas — keep the read cheap (1×1 pixel).
  const onCanvasMove = (e: MouseEvent): void => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx === null) return
    const rect = canvas.getBoundingClientRect()
    const u = (e.clientX - rect.left) / rect.width
    const v = (e.clientY - rect.top) / rect.height
    if (u < 0 || u > 1 || v < 0 || v > 1) { setProbe(null); return }
    const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(u * canvas.width)))
    const py = Math.min(canvas.height - 1, Math.max(0, Math.floor(v * canvas.height)))
    try {
      const data = ctx.getImageData(px, py, 1, 1).data
      setProbe({ x: px, y: py, r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! })
    } catch {
      // Some frame formats (e.g. YUV) produce canvases that refuse
      // readback; silently drop the probe.
      setProbe(null)
    }
  }
  const onCanvasLeave = (): void => setProbe(null)

  const resetView = (): void => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const selectedSnap = effectiveSelected !== null ? state.buffers.get(effectiveSelected) ?? null : null

  return (
    <section class="panel buffers-panel">
      <header class="panel-header buffers-header">
        <span>Buffers</span>
        <input
          type="text"
          class="protocol-filter"
          placeholder="filter…"
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
        />
        <span class="registry-count">{entries.length}</span>
      </header>
      <div class="buffers-layout">
        <ul class="buffers-list">
          {visible.length === 0 ? (
            <li class="panel-empty">No buffers{needle.length > 0 ? ' match' : ' yet'}.</li>
          ) : (
            visible.map((e) => (
              <li key={e.name}>
                <button
                  type="button"
                  class={
                    'buffers-row' +
                    (e.name === effectiveSelected ? ' buffers-row-selected' : '')
                  }
                  onClick={() => setSelectedName((prev) => (prev === e.name ? null : e.name))}
                  title={e.name === effectiveSelected ? 'Click again to stop streaming' : 'Stream this buffer'}
                >
                  <span class="buffers-name">{e.name}</span>
                  <span class="buffers-meta">
                    {(e.srcWidth > 0 ? e.srcWidth : e.width)}×
                    {(e.srcHeight > 0 ? e.srcHeight : e.height)} · {e.pixelType}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div
          class="buffers-stage"
          ref={mainRef}
          onWheel={selectedSnap !== null ? onWheel : undefined}
          onMouseDown={selectedSnap !== null ? onMouseDown : undefined}
        >
          {selectedSnap === null ? (
            <div class="panel-empty">
              {entries.length === 0 ? 'No buffers registered.' : 'Pick a buffer to stream.'}
            </div>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                class="buffers-canvas"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                onMouseMove={onCanvasMove}
                onMouseLeave={onCanvasLeave}
              />
              <div class="buffers-info">
                <span>{selectedSnap.name}</span>
                <span>
                  {selectedSnap.srcWidth > 0 ? selectedSnap.srcWidth : selectedSnap.width}×
                  {selectedSnap.srcHeight > 0 ? selectedSnap.srcHeight : selectedSnap.height}
                </span>
                <span>{selectedSnap.pixelType}</span>
                <span>{selectedSnap.display}</span>
                {!CODEC_AVAILABLE && <span class="buffers-warn">no WebCodecs — thumbnail fallback</span>}
                <span class="buffers-zoom">{zoom === 1 ? '1.0×' : `${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}×`}</span>
              </div>
              {probe !== null && (
                <div class="buffers-probe">
                  <span>({probe.x}, {probe.y})</span>
                  <span class="probe-chip" style={{ background: `rgb(${probe.r}, ${probe.g}, ${probe.b})` }} />
                  <span>{probe.r} {probe.g} {probe.b} {probe.a}</span>
                </div>
              )}
              {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
                <button
                  type="button"
                  class="buffers-reset"
                  onClick={resetView}
                  title="Reset zoom & pan"
                >⟲</button>
              )}
              <button
                type="button"
                class="buffers-close"
                onClick={() => setSelectedName(null)}
                title="Stop streaming"
                aria-label="Stop streaming"
              >×</button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
