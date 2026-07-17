/** @jsxImportSource preact */
/**
 * Buffers panel — live preview of registered debug textures.
 *
 * Same transport as the Tweakpane modal: when an entry is marked the
 * panel subscribes in `stream` mode so the provider ships VP9-encoded
 * frames through the worker. Decoded frames draw into a canvas which
 * aspect-fits to its cell and rescales on ResizeObserver.
 *
 * Thumbnail mode (downsampled `buffer:raw` payloads) is used as a fast
 * fallback when WebCodecs isn't available — the worker converts to RGBA8
 * and the panel paints via putImageData. Both paths share `fitCanvas`
 * so CSS sizing stays consistent across the mode switch.
 *
 * Multiple dashboard consumers (or the tweakpane modal) subscribing to
 * different entries is fine — the producer unions selections server-side.
 *
 * Multi-buffer grid (#29 Phase C slice 4): the user can mark more than
 * one buffer at once. Marked buffers lay out on the ladder issue #29
 * specifies — 1 = full, 2 = split, 4 = 2x2, 6 = 3x2, 9 = 3x3 — via
 * `gridLayoutFor`. Each visible cell is its own `BufferCell`, which
 * owns its own decoder pair (live + frozen-scrub) and its own
 * `FlightRing` (via `markBuffer`/`getBufferLiveRing`/`getBufferFrozenRing`
 * in `flight-ring.ts`) so N marked buffers scrub independently off one
 * atomic freeze. Only the visible cells (<= 9) are actually subscribed
 * and decoded — see `gridLayoutFor`'s overflow policy — and marking
 * beyond `CONCURRENT_MARK_GUARDRAIL` (~4) surfaces a warning without
 * blocking, since GPU readback + VP9 encode cost scales per buffer
 * (#29 item 8).
 *
 * The single-marked-buffer case renders its one `BufferCell` with
 * `full=true`, which is the only mode that gets the zoom/pan/pixel-probe
 * toolkit — identical to the pre-grid single-buffer UX. Grid cells (2+
 * marked) stay lean by design: comparing buffers side by side is the
 * point of the grid, deep pixel inspection is what dropping back to one
 * marked buffer is for.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { BufferChunkPayload, BufferSnapshot } from '../../devtools-client.js'
import { getClient } from '../client.js'
import { addFrameCursorListener, getFrameCursor } from '../frame-cursor.js'
import {
  CONCURRENT_MARK_GUARDRAIL,
  addFlightRingListener,
  exceedsMarkGuardrail,
  getBufferFrozenRing,
  getBufferLiveRing,
  isFrozen,
  markBuffer,
  unmarkBuffer,
} from '../flight-ring.js'
import { gridLayoutFor } from '../grid-layout.js'
import { useDevtoolsState } from '../hooks.js'
import { ScrubRequestTracker } from '../scrub-request-tracker.js'

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
  const [markedNames, setMarkedNames] = useState<string[]>([])
  const [filter, setFilter] = useState('')

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

  // Only drop a mark if the buffer itself has vanished from the
  // registry — filtering the LIST text should never silently stop a
  // stream the user is actively watching just because it scrolled out
  // of the filtered rows.
  const effectiveMarked = useMemo(
    () => markedNames.filter((name) => entries.some((e) => e.name === name)),
    [markedNames, entries],
  )

  const layout = gridLayoutFor(effectiveMarked.length)
  // Only the visible cells (grid-capped at 9, see `gridLayoutFor`'s
  // overflow policy) are actually subscribed/decoded — a buffer marked
  // beyond that cap stays remembered in `markedNames` but idle until
  // room opens up, so GPU readback + VP9 encode cost never exceeds
  // what's actually rendered.
  const visibleNames = effectiveMarked.slice(0, layout.visibleCount)
  const visibleKey = visibleNames.join('')

  const toggleMark = (name: string): void => {
    setMarkedNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  }

  // Subscribe/unsubscribe to stream mode for every visible marked
  // buffer at once. The dashboard is a fresh DevtoolsClient consumer
  // so this subscription is additive to whatever the tweakpane pane
  // happens to want — the provider unions selections across consumers.
  useEffect(() => {
    if (visibleNames.length === 0) {
      client.setBuffers({})
      return
    }
    client.setBuffers(Object.fromEntries(visibleNames.map((n) => [n, { mode: 'stream' as const }])))
    return () => { client.setBuffers({}) }
    // `visibleKey` is the primitive form of `visibleNames` — keeps this
    // effect from re-subscribing every render off a fresh array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, visibleKey])

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
        {effectiveMarked.length > 0 && (
          <span class={`buffers-marked-count${exceedsMarkGuardrail(effectiveMarked.length) ? ' buffers-marked-warn' : ''}`}>
            {effectiveMarked.length} marked
            {exceedsMarkGuardrail(effectiveMarked.length)
              ? ` — over the ~${CONCURRENT_MARK_GUARDRAIL}-buffer GPU guardrail`
              : ''}
          </span>
        )}
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
                    (effectiveMarked.includes(e.name) ? ' buffers-row-selected' : '')
                  }
                  onClick={() => toggleMark(e.name)}
                  title={effectiveMarked.includes(e.name) ? 'Click to remove from the grid' : 'Click to add to the grid'}
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
        <div class="buffers-stage">
          {visibleNames.length === 0 ? (
            <div class="panel-empty">
              {entries.length === 0 ? 'No buffers registered.' : 'Pick one or more buffers to stream.'}
            </div>
          ) : (
            <>
              <div
                class={`buffers-grid${visibleNames.length === 1 ? ' buffers-grid-full' : ''}`}
                style={{
                  gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
                }}
              >
                {visibleNames.map((name) => (
                  <BufferCell
                    key={name}
                    name={name}
                    full={visibleNames.length === 1}
                    onClose={() => toggleMark(name)}
                  />
                ))}
              </div>
              {layout.overflowCount > 0 && (
                <div class="buffers-overflow-badge">
                  +{layout.overflowCount} more marked — not shown (grid caps at 9)
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function BufferCell({
  name,
  full,
  onClose,
}: {
  name: string
  full: boolean
  onClose: () => void
}): preact.JSX.Element {
  const state = useDevtoolsState()
  const client = getClient()

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

  // Flight recorder ring lifecycle (#29 Phase C slice 4): mark this
  // buffer for its own ring on mount, drop the mark on unmount (e.g.
  // the user removes it, or the grid overflow policy no longer has
  // room for it). Freeze already atomically clones every currently
  // marked ring — see `flight-ring.ts`.
  useEffect(() => {
    markBuffer(name)
    return () => unmarkBuffer(name)
  }, [name])

  // WebCodecs decoder lifecycle — one instance per cell.
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
        // Parked cursor freezes the canvas (decode continues so the
        // delta chain stays valid; we just don't paint).
        if (getFrameCursor() !== null) {
          frame.close()
          return
        }
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

  // Wire chunk listener. Filters for this cell's buffer; reconfigures
  // the decoder when the source dimensions change (common on resize of
  // the producer's render target).
  useEffect(() => {
    const unsub = client.addChunkListener((chunk: BufferChunkPayload) => {
      if (chunk.name !== name) return
      getBufferLiveRing(name)?.pushChunk(chunk)
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
  }, [client, name])

  // Frozen scrub playback (#29 Phase C slice 2, generalized to
  // per-buffer rings in slice 4) — a decoder instance separate from
  // the live one above, fed only this buffer's OWN frozen ring
  // (`getBufferFrozenRing(name)`). Every chunk in the chain has to be
  // decoded in order to advance the delta chain, but only the LAST one
  // (the target) gets drawn — earlier ones just close().
  //
  // `decode()` is async: a rapid cursor move can queue a new (often
  // shorter) chain before the previous chain's outputs have all
  // arrived. `ScrubRequestTracker` correlates every output back to the
  // request that actually produced it (FIFO, matching `VideoDecoder`'s
  // in-order output guarantee) so a superseded request's outputs are
  // rejected regardless of count.
  const scrubDecoderRef = useRef<VideoDecoder | null>(null)
  const scrubDecoderDimsRef = useRef({ w: 0, h: 0 })
  const scrubTrackerRef = useRef(new ScrubRequestTracker())

  const stopScrubDecoder = (): void => {
    const d = scrubDecoderRef.current
    if (d !== null && d.state !== 'closed') {
      try { d.close() } catch { /* may already be errored */ }
    }
    scrubDecoderRef.current = null
    scrubDecoderDimsRef.current = { w: 0, h: 0 }
    scrubTrackerRef.current.reset()
  }

  const ensureScrubDecoder = (w: number, h: number): VideoDecoder | null => {
    if (
      scrubDecoderRef.current !== null &&
      scrubDecoderDimsRef.current.w === w &&
      scrubDecoderDimsRef.current.h === h
    ) {
      return scrubDecoderRef.current
    }
    stopScrubDecoder()
    const canvas = canvasRef.current
    if (canvas === null) return null
    const ctx = canvas.getContext('2d')
    if (ctx === null) return null
    const decoder = new globalThis.VideoDecoder({
      output: (frame) => {
        if (!scrubTrackerRef.current.reportOutput()) {
          frame.close()
          return
        }
        if (canvas.width !== frame.codedWidth || canvas.height !== frame.codedHeight) {
          canvas.width = frame.codedWidth
          canvas.height = frame.codedHeight
        }
        canvasSrcRef.current = { w: frame.codedWidth, h: frame.codedHeight }
        fitCanvas(frame.codedWidth, frame.codedHeight)
        ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0)
        frame.close()
      },
      error: () => { stopScrubDecoder() },
    })
    decoder.configure({ codec: VP9_CODEC, codedWidth: w, codedHeight: h })
    scrubDecoderRef.current = decoder
    scrubDecoderDimsRef.current = { w, h }
    return decoder
  }

  // Re-render on cursor moves and freeze/unfreeze toggles — neither
  // necessarily changes `state`.
  const [, setFlightTick] = useState(0)
  useEffect(() => {
    const offCursor = addFrameCursorListener(() => setFlightTick((n) => (n + 1) & 0xffff))
    const offRing = addFlightRingListener(() => setFlightTick((n) => (n + 1) & 0xffff))
    return () => { offCursor(); offRing() }
  }, [])

  const frozen = isFrozen()
  const cursorFrame = getFrameCursor()
  const frozenRing = frozen ? getBufferFrozenRing(name) : null
  // Whether this cell's own frozen ring can actually resolve a frame
  // for the current cursor — used both to decide whether to run the
  // decode below and to choose the parked-note copy in the render.
  // A buffer marked AFTER freeze has no frozen ring at all (it wasn't
  // live-tracked at freeze time) so playback correctly stays parked
  // rather than silently decoding nothing.
  const scrubAvailable =
    CODEC_AVAILABLE &&
    frozenRing !== null &&
    cursorFrame !== null &&
    (frozenRing.decodeChain(cursorFrame)?.length ?? 0) > 0

  useEffect(() => {
    if (!scrubAvailable || cursorFrame === null || frozenRing === null) {
      stopScrubDecoder()
      return
    }
    const chain = frozenRing.decodeChain(cursorFrame)
    if (chain === null || chain.length === 0) {
      stopScrubDecoder()
      return
    }
    const first = chain[0]!
    const decoder = ensureScrubDecoder(first.width, first.height)
    if (decoder === null) return
    const generation = scrubTrackerRef.current.start(chain.length)
    for (const c of chain) {
      try {
        // Enqueue before decode() so the tracker's FIFO already has an
        // entry to correlate against however soon the output arrives.
        scrubTrackerRef.current.enqueue(generation)
        decoder.decode(new EncodedVideoChunk({
          type: c.keyFrame ? 'key' : 'delta',
          timestamp: c.capturedAt * 1000,
          data: c.data,
        }))
      } catch {
        stopScrubDecoder()
        break
      }
    }
    // `scrubAvailable` already folds in every input this needs to react
    // to (frozen ring, cursor) — recomputing the chain here keeps the
    // dependency list to primitives instead of a fresh array reference
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubAvailable, cursorFrame])

  useEffect(() => stopScrubDecoder, [])

  // Thumbnail fallback: when WebCodecs isn't available the worker sends
  // `buffer:raw` payloads which land on `state.buffers[name].pixels`.
  // Paint those when the stream path isn't decoding.
  useEffect(() => {
    if (CODEC_AVAILABLE) return
    // Parked cursor freezes the canvas — the last-drawn pixels stay put
    // until the user returns to live, or (frozen) until a scrub decode
    // above lands one.
    if (getFrameCursor() !== null) return
    const snap = state.buffers.get(name)
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
  }, [state.buffers, name])

  // Re-fit on layout changes (panel resize, sidebar collapse, grid
  // ladder swap, etc.).
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

  // Reset view when the cell's buffer changes, or when it transitions
  // between full and grid mode (only `full` applies zoom/pan/probe
  // interaction — without this, a leftover zoom from a cell's last run
  // as the sole marked buffer would silently reappear if it later
  // returns to full view).
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setProbe(null)
  }, [name, full])

  const onWheel = (e: WheelEvent): void => {
    if (!full) return
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
    if (!full || e.button !== 0) return
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }
  useEffect(() => {
    if (!full) return
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
  }, [full])

  // Pixel probe: translate the cursor's screen-space position into the
  // canvas's backing-buffer coordinates, then `getImageData(1,1)` at
  // that point. Full mode only.
  const onCanvasMove = (e: MouseEvent): void => {
    if (!full) return
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

  const snap: BufferSnapshot | null = state.buffers.get(name) ?? null

  return (
    <div
      class={`buffers-cell${full ? ' buffers-cell-full' : ''}`}
      ref={mainRef}
      onWheel={full && snap !== null ? onWheel : undefined}
      onMouseDown={full && snap !== null ? onMouseDown : undefined}
    >
      {snap === null ? (
        <div class="panel-empty">Waiting for {name}…</div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            class="buffers-canvas"
            style={full ? { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` } : undefined}
            onMouseMove={onCanvasMove}
            onMouseLeave={onCanvasLeave}
          />
          {cursorFrame !== null && !scrubAvailable ? (
            <div class="buffers-parked-note">
              {frozen
                ? `parked at frame ${cursorFrame} — outside the frozen recording window`
                : `parked at frame ${cursorFrame} — freeze to enable scrub playback`}
            </div>
          ) : null}
          <div class="buffers-info">
            <span>{snap.name}</span>
            <span>
              {snap.srcWidth > 0 ? snap.srcWidth : snap.width}×
              {snap.srcHeight > 0 ? snap.srcHeight : snap.height}
            </span>
            {full && <span>{snap.pixelType}</span>}
            {full && <span>{snap.display}</span>}
            {full && !CODEC_AVAILABLE && <span class="buffers-warn">no WebCodecs — thumbnail fallback</span>}
            {full && <span class="buffers-zoom">{zoom === 1 ? '1.0×' : `${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}×`}</span>}
          </div>
          {full && probe !== null && (
            <div class="buffers-probe">
              <span>({probe.x}, {probe.y})</span>
              <span class="probe-chip" style={{ background: `rgb(${probe.r}, ${probe.g}, ${probe.b})` }} />
              <span>{probe.r} {probe.g} {probe.b} {probe.a}</span>
            </div>
          )}
          {full && (zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
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
            onClick={onClose}
            title="Stop streaming"
            aria-label="Stop streaming"
          >×</button>
        </>
      )}
    </div>
  )
}
