import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useViewport } from './Viewport'

export type Rect = {
  id: string
  x: number
  y: number
  w: number
  h: number
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

  /** Optional styling overrides. Stroke is non-scaling by default. */
  color?: string
  /** In-progress drag rect color. */
  draftColor?: string
  /** Selected rect accent — defaults to the VSCode focus border. */
  selectedColor?: string
}

type Drag = { start: { x: number; y: number }; current: { x: number; y: number } }

function normalized(d: Drag) {
  return {
    x: Math.min(d.start.x, d.current.x),
    y: Math.min(d.start.y, d.current.y),
    w: Math.abs(d.current.x - d.start.x),
    h: Math.abs(d.current.y - d.start.y),
  }
}

const EMPTY: ReadonlySet<string> = new Set()

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
 *     <draft pointer-events:none>
 *       ← doesn't block drag-move
 */
export function RectOverlay({
  rects,
  drawEnabled,
  onRectCreate,
  selectedIds = EMPTY,
  onSelectionChange,
  color = '#ffcc00',
  draftColor = '#00ff99',
  selectedColor = 'var(--vscode-focusBorder, #007fd4)',
}: RectOverlayProps) {
  const vp = useViewport()
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

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

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${vp.imageW} ${vp.imageH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {/* Background catcher: present whenever we need to handle empty-space
          clicks (draw start or deselect). Transparent fill, but pointer-
          events:all so it receives the hit when the user clicks past
          the rects. */}
      {(drawEnabled || selectionActive) && (
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
              // Click on empty space in select-only modes → clear.
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
                }
              }
              return null
            })
          }}
          onPointerCancel={() => setDrag(null)}
        />
      )}

      {rects.map((r) => {
        const sel = selectedIds.has(r.id)
        return (
          <rect
            key={r.id}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill={sel ? 'rgba(0, 127, 212, 0.12)' : 'rgba(255, 204, 0, 0.05)'}
            stroke={sel ? selectedColor : color}
            strokeWidth={sel ? 2 : 1}
            vectorEffect="non-scaling-stroke"
            shapeRendering="crispEdges"
            style={{
              pointerEvents: 'all',
              cursor: 'pointer',
            }}
            onPointerDown={(e) => {
              // Rect clicks always take precedence over draw/deselect so
              // selections work regardless of the active tool.
              e.stopPropagation()
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
            }}
          />
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
