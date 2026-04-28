import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useViewport, viewBoxFor } from './Viewport'

export type Rect = {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Optional human label; falls back to a frame index in display code. */
  name?: string
}

export type RectOverlayProps = {
  rects: readonly Rect[]
  /** When true, click-drag on empty image space creates new rects. */
  drawEnabled: boolean
  onRectCreate?: (rect: Rect) => void

  /** Current selection. Rects in this set render with focus chrome. */
  selectedIds?: ReadonlySet<string>
  /**
   * Called when the user clicks a rect or empty space. Gets the new full
   * selection so callers don't track additive/replace logic.
   */
  onSelectionChange?: (ids: Set<string>) => void

  /**
   * Called when the user drags a rect's body (move) or one of its
   * resize handles (resize). Fires on pointerup with the final geometry,
   * not on every move event — callers don't need to debounce.
   * Omit to make rects geometrically read-only.
   */
  onRectChange?: (id: string, next: { x: number; y: number; w: number; h: number }) => void

  /**
   * If > 0, snap committed move/resize geometry to multiples of this
   * value (image-pixel units). Useful for tile-based authoring where
   * everything sits on an N-pixel grid. The drag preview snaps live so
   * the user sees the grid alignment as they move. Holding Shift during
   * the drag temporarily disables snapping.
   */
  snapStep?: number

  /** Whether to render a name / index label next to each rect. Default: true. */
  showLabels?: boolean

  /** Optional styling overrides. Stroke is non-scaling by default. */
  color?: string
  /** In-progress drag rect color. */
  draftColor?: string
  /** Selected rect accent — defaults to the VSCode focus border. */
  selectedColor?: string

  /**
   * When false, rects render at reduced opacity and ignore pointer events
   * (visual context only). Used by Atlas while another modal overlay
   * (grid slicing) owns interaction. Defaults to true.
   */
  interactive?: boolean

  /**
   * Fires when the user hovers over a rect (or leaves to empty space).
   * null = no rect hovered. Called once per hover-state change, not on
   * every pointer-move.
   */
  onHoverChange?: (rect: Rect | null) => void
}

// ─── Draw drag (new rect creation) ───────────────────────────────────────────

type Drag = { start: { x: number; y: number }; current: { x: number; y: number } }

function normalized(d: Drag) {
  return {
    x: Math.min(d.start.x, d.current.x),
    y: Math.min(d.start.y, d.current.y),
    w: Math.abs(d.current.x - d.start.x),
    h: Math.abs(d.current.y - d.start.y),
  }
}

// ─── Move drag ───────────────────────────────────────────────────────────────

type MoveDrag = {
  id: string
  pointerId: number
  startImg: { x: number; y: number }
  startRect: { x: number; y: number; w: number; h: number }
  /** Preview position while dragging (image-px). */
  preview: { x: number; y: number }
  /** Has the pointer moved past the click-vs-drag threshold? */
  committed: boolean
}

// ─── Resize handles ──────────────────────────────────────────────────────────

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

type ResizeDrag = {
  id: string
  handle: HandleDir
  pointerId: number
  startImg: { x: number; y: number }
  startRect: { x: number; y: number; w: number; h: number }
  /** Current constrained preview geometry while dragging. */
  preview: { x: number; y: number; w: number; h: number }
}

const HANDLE_CURSORS: Record<HandleDir, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

/** Distance in image-px below which a pointerdown+up is treated as a click. */
const MOVE_THRESHOLD_PX = 3

/**
 * Resize edges within this many image-pixels of another rect's matching
 * edge snap to it. Holding Shift bypasses (matches the snapStep convention).
 */
const RESIZE_SNAP_PX = 4

/** Edges that a given handle direction modifies. */
function movedEdges(dir: HandleDir): { left: boolean; right: boolean; top: boolean; bottom: boolean } {
  return {
    left: dir === 'nw' || dir === 'w' || dir === 'sw',
    right: dir === 'ne' || dir === 'e' || dir === 'se',
    top: dir === 'nw' || dir === 'n' || dir === 'ne',
    bottom: dir === 'sw' || dir === 's' || dir === 'se',
  }
}

/**
 * After raw resize, pull each moved edge to the nearest matching edge of
 * any OTHER rect within `threshold`. Mirrors how design tools nudge new
 * geometry into alignment with neighbors. Width/height stay ≥ 1.
 */
function snapResizeToRectEdges(
  next: { x: number; y: number; w: number; h: number },
  dir: HandleDir,
  others: readonly Rect[],
  threshold: number,
): { x: number; y: number; w: number; h: number } {
  if (others.length === 0) return next
  const moved = movedEdges(dir)
  const xCandidates = new Set<number>()
  const yCandidates = new Set<number>()
  for (const r of others) {
    xCandidates.add(r.x)
    xCandidates.add(r.x + r.w)
    yCandidates.add(r.y)
    yCandidates.add(r.y + r.h)
  }
  const snap1d = (v: number, candidates: Iterable<number>) => {
    let best = v
    let bestDist = threshold + 0.5 // strict <= against threshold
    for (const c of candidates) {
      const d = Math.abs(c - v)
      if (d < bestDist) {
        bestDist = d
        best = c
      }
    }
    return best
  }

  let { x, y, w, h } = next
  if (moved.left) {
    const right = x + w
    const sx = snap1d(x, xCandidates)
    x = Math.min(sx, right - 1)
    w = right - x
  }
  if (moved.right) {
    const sr = snap1d(x + w, xCandidates)
    w = Math.max(1, sr - x)
  }
  if (moved.top) {
    const bottom = y + h
    const sy = snap1d(y, yCandidates)
    y = Math.min(sy, bottom - 1)
    h = bottom - y
  }
  if (moved.bottom) {
    const sb = snap1d(y + h, yCandidates)
    h = Math.max(1, sb - y)
  }
  return { x, y, w, h }
}

const EMPTY: ReadonlySet<string> = new Set()

// ─── CornerIndex ─────────────────────────────────────────────────────────────

/**
 * Tiny monospace digit drawn inside the top-left corner of a rect.
 * Always visible — no hover-fade, no group-hide logic.
 * Uses image-pixel units (we're inside the viewBox-scaled SVG).
 */
function CornerIndex({
  rect,
  index,
  selected,
  imgW,
}: {
  rect: { x: number; y: number; w: number; h: number }
  index: number
  selected: boolean
  imgW: number
}) {
  const fontPx = Math.max(7, Math.round(imgW / 120))

  return (
    <text
      x={rect.x + 1}
      y={rect.y + fontPx + 1}
      fontSize={fontPx}
      fontFamily="var(--vscode-editor-font-family, monospace)"
      fill={selected ? '#ffcc00' : 'var(--vscode-descriptionForeground, #aaa)'}
      vectorEffect="non-scaling-stroke"
      style={{
        paintOrder: 'stroke',
        stroke: 'rgba(0, 0, 0, 0.55)',
        strokeWidth: 1.5,
        strokeLinejoin: 'round',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
      dominantBaseline="auto"
    >
      {index}
    </text>
  )
}

// ─── Handle geometry helpers ─────────────────────────────────────────────────

/** Returns the center point for a given handle direction on a rect. */
function handleCenter(
  r: { x: number; y: number; w: number; h: number },
  dir: HandleDir,
): { x: number; y: number } {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  switch (dir) {
    case 'nw': return { x: r.x, y: r.y }
    case 'n':  return { x: cx, y: r.y }
    case 'ne': return { x: r.x + r.w, y: r.y }
    case 'e':  return { x: r.x + r.w, y: cy }
    case 'se': return { x: r.x + r.w, y: r.y + r.h }
    case 's':  return { x: cx, y: r.y + r.h }
    case 'sw': return { x: r.x, y: r.y + r.h }
    case 'w':  return { x: r.x, y: cy }
  }
}

const ALL_HANDLES: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/**
 * Compute preview geometry for a resize drag given the current pointer
 * position. Clamps to image bounds and enforces 1×1 minimum size.
 */
function applyResizeDelta(
  start: { x: number; y: number },
  startRect: { x: number; y: number; w: number; h: number },
  current: { x: number; y: number },
  handle: HandleDir,
  imageW: number,
  imageH: number,
): { x: number; y: number; w: number; h: number } {
  const dx = current.x - start.x
  const dy = current.y - start.y

  let { x, y, w, h } = startRect

  // Apply delta to the edges that this handle controls.
  // Horizontal axis
  if (handle === 'nw' || handle === 'w' || handle === 'sw') {
    // Moving the left edge
    const rawLeft = Math.max(0, Math.min(x + w - 1, x + dx))
    w = x + w - rawLeft
    x = rawLeft
  } else if (handle === 'ne' || handle === 'e' || handle === 'se') {
    // Moving the right edge
    const rawRight = Math.max(x + 1, Math.min(imageW, x + w + dx))
    w = rawRight - x
  }

  // Vertical axis
  if (handle === 'nw' || handle === 'n' || handle === 'ne') {
    // Moving the top edge
    const rawTop = Math.max(0, Math.min(y + h - 1, y + dy))
    h = y + h - rawTop
    y = rawTop
  } else if (handle === 'sw' || handle === 's' || handle === 'se') {
    // Moving the bottom edge
    const rawBottom = Math.max(y + 1, Math.min(imageH, y + h + dy))
    h = rawBottom - y
  }

  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

// ─── RectOverlay ─────────────────────────────────────────────────────────────

/**
 * SVG overlay layer for rect editing. Sits on top of the three.js canvas
 * and uses `viewBox="0 0 imageW imageH"` + `preserveAspectRatio="xMidYMid
 * meet"`, so SVG-local coords ARE image-pixel coords — pointer-event math
 * collapses to one `createSVGPoint` + inverse CTM transform. No raycast.
 *
 * Layering & pointer semantics (see .pointerEvents props below):
 *
 *   <svg pointer-events:none>
 *     ← canvas underneath catches anything we don't claim
 *     <background-catcher pointer-events:all>
 *       ← present when drawing or selecting; handles draws + deselect
 *     <rect-N pointer-events:all>  for each rect
 *       ← always catches clicks so rects are always selectable
 *     <handles-N pointer-events:all>  for each selected rect
 *       ← sits above rect chrome; stopPropagation prevents move drag
 *     <draft pointer-events:none>
 *       ← doesn't block drag-move
 */
export function RectOverlay({
  rects,
  drawEnabled,
  onRectCreate,
  selectedIds = EMPTY,
  onSelectionChange,
  onRectChange,
  showLabels = true,
  // Resting rects read as quiet chrome; selection pops to bright yellow.
  color = 'var(--vscode-descriptionForeground, #888)',
  draftColor = '#00ff99',
  selectedColor = '#ffcc00',
  interactive = true,
  snapStep = 0,
  onHoverChange,
}: RectOverlayProps) {
  // Round a number to the nearest multiple of `step`, with a 0/Shift-key
  // pass-through. The Shift check happens at call sites that have the
  // event in scope; this helper just does the arithmetic.
  const snap = (v: number): number => (snapStep > 0 ? Math.round(v / snapStep) * snapStep : Math.round(v))
  const snapRect = (r: { x: number; y: number; w: number; h: number }) => ({
    x: snap(r.x),
    y: snap(r.y),
    w: Math.max(1, snap(r.w)),
    h: Math.max(1, snap(r.h)),
  })
  const vp = useViewport()
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Move-drag state (stored in ref so pointermove handler always sees latest)
  const moveDragRef = useRef<MoveDrag | null>(null)
  const [moveDragPreview, setMoveDragPreview] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)

  // Resize-drag state
  const resizeDragRef = useRef<ResizeDrag | null>(null)
  const [resizeDragPreview, setResizeDragPreview] = useState<{
    id: string
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  // Fire onHoverChange whenever hover changes OR a drag preview updates
  // for the hovered rect — consumers (HoverFrameChip) want to track the
  // live in-progress geometry, not the pre-drag values.
  const onHoverChangeRef = useRef(onHoverChange)
  onHoverChangeRef.current = onHoverChange

  useEffect(() => {
    if (!hoveredId) {
      onHoverChangeRef.current?.(null)
      return
    }
    const base = rects.find((r) => r.id === hoveredId) ?? null
    if (!base) {
      onHoverChangeRef.current?.(null)
      return
    }
    if (resizeDragPreview && resizeDragPreview.id === hoveredId) {
      onHoverChangeRef.current?.({
        ...base,
        x: resizeDragPreview.x,
        y: resizeDragPreview.y,
        w: resizeDragPreview.w,
        h: resizeDragPreview.h,
      })
      return
    }
    if (moveDragPreview && moveDragPreview.id === hoveredId) {
      onHoverChangeRef.current?.({
        ...base,
        x: moveDragPreview.x,
        y: moveDragPreview.y,
      })
      return
    }
    onHoverChangeRef.current?.(base)
  }, [hoveredId, rects, moveDragPreview, resizeDragPreview])

  const toImagePx = useCallback(
    (e: ReactPointerEvent<SVGElement>): { x: number; y: number } | null => {
      const svg = svgRef.current
      if (!svg || !vp) return null
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const m = svg.getScreenCTM()
      if (!m) return null
      const local = pt.matrixTransform(m.inverse())
      return {
        x: Math.max(0, Math.min(vp.imageW, Math.round(local.x))),
        y: Math.max(0, Math.min(vp.imageH, Math.round(local.y))),
      }
    },
    [vp]
  )

  if (!vp) return null

  const inProgress = drag ? normalized(drag) : null
  const selectionActive = Boolean(onSelectionChange)

  // ── Handle size in image-px: 4×4 squares, centered on the corner/edge ────
  // We keep them fixed-size in image-px so zoom doesn't shrink them to nothing.
  const HANDLE_SIZE = 4

  // ── Escape cancels any active drag ────────────────────────────────────────
  const handleKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'Escape') return
    // Cancel draw drag
    setDrag(null)
    // Cancel move drag
    if (moveDragRef.current) {
      moveDragRef.current = null
      setMoveDragPreview(null)
    }
    // Cancel resize drag
    if (resizeDragRef.current) {
      resizeDragRef.current = null
      setResizeDragPreview(null)
    }
  }

  // ── Rect body pointerdown: move or select ─────────────────────────────────
  const handleRectPointerDown = (r: Rect, e: ReactPointerEvent<SVGRectElement>) => {
    // Always stop so background catcher doesn't start a draw.
    e.stopPropagation()

    if (onRectChange && selectedIds.has(r.id)) {
      // Capture pointer for move drag.
      e.currentTarget.setPointerCapture(e.pointerId)
      const p = toImagePx(e)
      if (!p) return
      moveDragRef.current = {
        id: r.id,
        pointerId: e.pointerId,
        startImg: p,
        startRect: { x: r.x, y: r.y, w: r.w, h: r.h },
        preview: { x: r.x, y: r.y },
        committed: false,
      }
      // Don't update preview yet — wait for threshold.
    } else {
      // Selection-only path (existing behavior).
      if (!onSelectionChange) return
      const next = new Set(selectedIds)
      if (e.shiftKey) {
        if (next.has(r.id)) next.delete(r.id)
        else next.add(r.id)
      } else {
        next.clear()
        next.add(r.id)
      }
      onSelectionChange(next)
    }
  }

  // ── Rect body pointermove: update move drag preview ───────────────────────
  const handleRectPointerMove = (r: Rect, e: ReactPointerEvent<SVGRectElement>) => {
    const md = moveDragRef.current
    if (!md || md.id !== r.id || e.pointerId !== md.pointerId) return
    const p = toImagePx(e)
    if (!p || !vp) return

    const dx = p.x - md.startImg.x
    const dy = p.y - md.startImg.y

    if (!md.committed) {
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < MOVE_THRESHOLD_PX) return
      md.committed = true
    }

    // Clamp so rect stays within image bounds.
    const newX = Math.max(0, Math.min(vp.imageW - md.startRect.w, md.startRect.x + dx))
    const newY = Math.max(0, Math.min(vp.imageH - md.startRect.h, md.startRect.y + dy))
    md.preview = { x: Math.round(newX), y: Math.round(newY) }
    setMoveDragPreview({ id: r.id, x: md.preview.x, y: md.preview.y })
  }

  // ── Rect body pointerup: commit move or do selection click ────────────────
  const handleRectPointerUp = (r: Rect, e: ReactPointerEvent<SVGRectElement>) => {
    const md = moveDragRef.current
    if (md && md.id === r.id && e.pointerId === md.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      if (md.committed) {
        // Committed drag — fire onRectChange with final (snapped if
        // configured, raw if Shift was held during release).
        const raw = {
          x: md.preview.x,
          y: md.preview.y,
          w: md.startRect.w,
          h: md.startRect.h,
        }
        onRectChange!(r.id, e.shiftKey ? raw : snapRect(raw))
      } else {
        // Sub-threshold: treat as a click → selection.
        if (onSelectionChange) {
          const next = new Set(selectedIds)
          if (e.shiftKey) {
            if (next.has(r.id)) next.delete(r.id)
            else next.add(r.id)
          } else {
            next.clear()
            next.add(r.id)
          }
          onSelectionChange(next)
        }
      }
      moveDragRef.current = null
      setMoveDragPreview(null)
    }
  }

  // ── Rect body pointercancel: revert move drag ─────────────────────────────
  const handleRectPointerCancel = (r: Rect) => {
    const md = moveDragRef.current
    if (md && md.id === r.id) {
      moveDragRef.current = null
      setMoveDragPreview(null)
    }
  }

  // ── Handle pointerdown: start resize ─────────────────────────────────────
  const handleResizePointerDown = (
    r: Rect,
    dir: HandleDir,
    e: ReactPointerEvent<SVGRectElement>,
  ) => {
    // Stop propagation so the rect body move handler doesn't also fire.
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toImagePx(e)
    if (!p) return
    resizeDragRef.current = {
      id: r.id,
      handle: dir,
      pointerId: e.pointerId,
      startImg: p,
      startRect: { x: r.x, y: r.y, w: r.w, h: r.h },
      preview: { x: r.x, y: r.y, w: r.w, h: r.h },
    }
    setResizeDragPreview({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h })
  }

  // ── Handle pointermove: update resize preview ─────────────────────────────
  const handleResizePointerMove = (r: Rect, e: ReactPointerEvent<SVGRectElement>) => {
    const rd = resizeDragRef.current
    if (!rd || rd.id !== r.id || e.pointerId !== rd.pointerId) return
    const p = toImagePx(e)
    if (!p || !vp) return
    const raw = applyResizeDelta(rd.startImg, rd.startRect, p, rd.handle, vp.imageW, vp.imageH)
    // Snap each moved edge to nearby edges of OTHER rects so the user can
    // align frames without per-pixel hunting. Shift bypasses (same
    // convention as the existing grid snap).
    const next = e.shiftKey
      ? raw
      : snapResizeToRectEdges(raw, rd.handle, rects.filter((x) => x.id !== r.id), RESIZE_SNAP_PX)
    rd.preview = next
    setResizeDragPreview({ id: r.id, ...next })
  }

  // ── Handle pointerup: commit resize ───────────────────────────────────────
  const handleResizePointerUp = (r: Rect, e: ReactPointerEvent<SVGRectElement>) => {
    const rd = resizeDragRef.current
    if (!rd || rd.id !== r.id || e.pointerId !== rd.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    onRectChange!(r.id, e.shiftKey ? rd.preview : snapRect(rd.preview))
    resizeDragRef.current = null
    setResizeDragPreview(null)
  }

  // ── Handle pointercancel: revert resize ───────────────────────────────────
  const handleResizePointerCancel = (r: Rect) => {
    const rd = resizeDragRef.current
    if (rd && rd.id === r.id) {
      resizeDragRef.current = null
      setResizeDragPreview(null)
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox={viewBoxFor(vp)}
      preserveAspectRatio="xMidYMid meet"
      tabIndex={-1}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        outline: 'none',
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Background catcher: present whenever we need to handle empty-space
          clicks (draw start or deselect). Transparent fill, but pointer-
          events:all so it receives the hit when the user clicks past
          the rects. */}
      {interactive && (drawEnabled || selectionActive) && (
        // Image-area catcher: starts new draws and consumes empty-space
        // clicks INSIDE the image bounds. Margin clicks (outside the
        // image) are handled by CanvasStage's stage-level background
        // catcher — no need to inflate this rect to canvas size.
        <rect
          x={0}
          y={0}
          width={vp.imageW}
          height={vp.imageH}
          fill="transparent"
          style={{
            pointerEvents: 'all',
            cursor: drawEnabled ? 'crosshair' : selectionActive ? 'default' : 'default',
          }}
          onPointerDown={(e) => {
            if (drawEnabled) {
              e.currentTarget.setPointerCapture(e.pointerId)
              const p = toImagePx(e)
              if (p) setDrag({ start: p, current: p })
            } else if (selectionActive) {
              onSelectionChange?.(new Set())
            }
          }}
          onPointerMove={(e) => {
            if (!drag) return
            const p = toImagePx(e)
            if (p) setDrag((d) => (d ? { ...d, current: p } : null))
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId)
            }
            setDrag((d) => {
              if (d && onRectCreate) {
                const r = normalized(d)
                if (r.w >= 2 && r.h >= 2) {
                  onRectCreate({ id: crypto.randomUUID(), ...r })
                } else if (selectionActive) {
                  // Tiny / no-drag click on empty in-image space →
                  // treat as a deselect so the user can clear the
                  // selection without leaving the rect tool.
                  onSelectionChange?.(new Set())
                }
              }
              return null
            })
          }}
          onPointerCancel={() => setDrag(null)}
        />
      )}

      {rects.map((r, i) => {
        const sel = selectedIds.has(r.id)

        // During move drag, show preview position for this rect.
        const isMoving = moveDragPreview?.id === r.id && moveDragRef.current?.committed
        const isResizing = resizeDragPreview?.id === r.id
        const dispX = isMoving ? moveDragPreview!.x : isResizing ? resizeDragPreview!.x : r.x
        const dispY = isMoving ? moveDragPreview!.y : isResizing ? resizeDragPreview!.y : r.y
        const dispW = isResizing ? resizeDragPreview!.w : r.w
        const dispH = isResizing ? resizeDragPreview!.h : r.h

        // Rect used for display (may differ from r during drag).
        const dispRect = { x: dispX, y: dispY, w: dispW, h: dispH }

        // Cursor for the rect body: show 'move' when onRectChange is set
        // and this rect is selected, otherwise pointer.
        const canMove = Boolean(onRectChange) && sel && interactive
        const bodyCursor = isMoving ? 'grabbing' : canMove ? 'grab' : 'pointer'

        return (
          <g key={r.id}>
            <rect
              x={dispX}
              y={dispY}
              width={dispW}
              height={dispH}
              fill={sel ? 'rgba(255, 204, 0, 0.12)' : 'transparent'}
              stroke={sel ? selectedColor : color}
              strokeWidth={sel ? 2 : 1}
              vectorEffect="non-scaling-stroke"
              shapeRendering="crispEdges"
              opacity={interactive ? 1 : 0.35}
              style={{
                pointerEvents: interactive ? 'all' : 'none',
                cursor: bodyCursor,
              }}
              onPointerEnter={() => setHoveredId(r.id)}
              onPointerLeave={() => {
                // Don't clear hover while a drag is in flight — the
                // pointer can leave the rect's body when the user
                // resizes outward or moves the rect away faster than
                // the cursor. We want the chip to stay anchored to the
                // rect being edited until the drag settles.
                if (moveDragRef.current || resizeDragRef.current) return
                setHoveredId((cur) => (cur === r.id ? null : cur))
              }}
              onPointerDown={(e) => handleRectPointerDown(r, e)}
              onPointerMove={(e) => handleRectPointerMove(r, e)}
              onPointerUp={(e) => handleRectPointerUp(r, e)}
              onPointerCancel={() => handleRectPointerCancel(r)}
            />
            {showLabels ? (
              <CornerIndex
                rect={dispRect}
                index={i}
                selected={sel}
                imgW={vp.imageW}
              />
            ) : null}
          </g>
        )
      })}

      {/* Resize handles — rendered above all rect chrome so they're always
          on top and hittable. One <g> per selected rect. Only when
          onRectChange is provided and overlay is interactive. */}
      {interactive && onRectChange &&
        rects.map((r) => {
          if (!selectedIds.has(r.id)) return null

          const isResizing = resizeDragPreview?.id === r.id
          const isMoving = moveDragPreview?.id === r.id && moveDragRef.current?.committed
          const gx = isMoving ? moveDragPreview!.x : isResizing ? resizeDragPreview!.x : r.x
          const gy = isMoving ? moveDragPreview!.y : isResizing ? resizeDragPreview!.y : r.y
          const gw = isResizing ? resizeDragPreview!.w : r.w
          const gh = isResizing ? resizeDragPreview!.h : r.h
          const gr = { x: gx, y: gy, w: gw, h: gh }

          return (
            <g key={`handles-${r.id}`}>
              {ALL_HANDLES.map((dir) => {
                const center = handleCenter(gr, dir)
                const hx = center.x - HANDLE_SIZE / 2
                const hy = center.y - HANDLE_SIZE / 2
                return (
                  <rect
                    key={dir}
                    x={hx}
                    y={hy}
                    width={HANDLE_SIZE}
                    height={HANDLE_SIZE}
                    fill={selectedColor}
                    shapeRendering="crispEdges"
                    style={{
                      pointerEvents: 'all',
                      cursor: HANDLE_CURSORS[dir],
                    }}
                    onPointerDown={(e) => handleResizePointerDown(r, dir, e)}
                    onPointerMove={(e) => handleResizePointerMove(r, e)}
                    onPointerUp={(e) => handleResizePointerUp(r, e)}
                    onPointerCancel={() => handleResizePointerCancel(r)}
                  />
                )
              })}
            </g>
          )
        })}

      {inProgress ? (
        <rect
          x={inProgress.x}
          y={inProgress.y}
          width={inProgress.w}
          height={inProgress.h}
          fill="rgba(0, 255, 153, 0.1)"
          stroke={draftColor}
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          shapeRendering="crispEdges"
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
    </svg>
  )
}
