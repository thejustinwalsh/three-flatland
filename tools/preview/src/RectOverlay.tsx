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
  /** When true, click-drag on the image creates new rects. */
  drawEnabled: boolean
  onRectCreate?: (rect: Rect) => void
  /** Optional styling overrides. Stroke is non-scaling by default. */
  color?: string
  /** Color for the in-progress drag rect. */
  draftColor?: string
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

/**
 * SVG overlay layer for rect editing. Sits on top of the three.js canvas
 * and uses `viewBox="0 0 imageW imageH"` + `preserveAspectRatio="xMidYMid
 * meet"`, which makes SVG-local coords identical to image-pixel coords —
 * pointer-event math collapses to one `createSVGPoint()` + inverse CTM
 * transform. No raycasting, no world-space projection.
 *
 * pointer-events on the <svg> toggle with `drawEnabled` so when the user
 * isn't drawing, clicks pass through to the canvas underneath.
 */
export function RectOverlay({
  rects,
  drawEnabled,
  onRectCreate,
  color = '#ffcc00',
  draftColor = '#00ff99',
}: RectOverlayProps) {
  const vp = useViewport()
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const toImagePx = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>): { x: number; y: number } | null => {
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
        // Catch pointer events only when actively drawing; otherwise let
        // them fall through to the three.js canvas below.
        pointerEvents: drawEnabled ? 'auto' : 'none',
        cursor: drawEnabled ? 'crosshair' : 'default',
      }}
      onPointerDown={(e) => {
        if (!drawEnabled) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = toImagePx(e)
        if (p) setDrag({ start: p, current: p })
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
    >
      {rects.map((r) => (
        <rect
          key={r.id}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill="rgba(255, 204, 0, 0.05)"
          stroke={color}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          shapeRendering="crispEdges"
        />
      ))}
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
        />
      ) : null}
    </svg>
  )
}
