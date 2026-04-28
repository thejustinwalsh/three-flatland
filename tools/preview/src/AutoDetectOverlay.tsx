import { useViewport, viewBoxFor } from './Viewport'
import type { DetectedRect } from './ccl'

export type { DetectedRect }

export type AutoDetectOverlayProps = {
  /** Detected rects to display. Pass [] to render nothing. */
  detected: readonly DetectedRect[]
  /** Set of detected-rect indices the user has picked. */
  picked: ReadonlySet<number>
  /** Toggle a single detected rect. `additive` reflects whether Shift was held. */
  onToggle: (index: number, additive: boolean) => void
  /** Optional: replace the entire picked set in one call. */
  onSetPicked?: (picked: Set<number>) => void
}

const DEFAULTS = {
  pickFill: 'rgba(255, 204, 0, 0.22)',
  hoverFill: 'rgba(255, 204, 0, 0.08)',
  pickStroke: '#ffcc00',
  idleStroke: 'rgba(255, 204, 0, 0.45)',
}

/**
 * SVG overlay that previews auto-detected sprite bounding boxes and lets the
 * user pick which to commit.
 *
 * Rendering contract:
 *   - Idle rects: thin dim-yellow outline, no fill.
 *   - Picked rects: bold #ffcc00 stroke + translucent fill + 1-based index
 *     label at top-left (matching GridSliceOverlay's label style).
 *   - Single-click toggles pick. Shift-click is additive (caller decides
 *     how to interpret the `additive` flag).
 *
 * This is a pure rendering component — it does not recompute detected rects.
 * The caller controls when `connectedComponents()` is invoked and passes the
 * stable result array down.
 */
export function AutoDetectOverlay({
  detected,
  picked,
  onToggle,
}: AutoDetectOverlayProps) {
  const vp = useViewport()
  if (!vp || detected.length === 0) return null

  const labelPx = Math.max(7, Math.round(vp.imageW / 120))

  return (
    <svg
      viewBox={viewBoxFor(vp)}
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {detected.map((rect, i) => {
        const isPicked = picked.has(i)
        const { x, y, w, h } = rect

        return (
          <g key={i}>
            {/* Hit area — full rect, transparent fill, receives pointer events */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={isPicked ? DEFAULTS.pickFill : 'transparent'}
              stroke="none"
              shapeRendering="crispEdges"
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                onToggle(i, e.shiftKey)
              }}
            />

            {/* Outline: inset by 1px when picked to stay fully inside the bbox */}
            {isPicked && w > 2 && h > 2 ? (
              <rect
                x={x + 1}
                y={y + 1}
                width={w - 2}
                height={h - 2}
                fill="none"
                stroke={DEFAULTS.pickStroke}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                shapeRendering="crispEdges"
                style={{ pointerEvents: 'none' }}
              />
            ) : (
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="none"
                stroke={DEFAULTS.idleStroke}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                shapeRendering="crispEdges"
                style={{ pointerEvents: 'none' }}
              />
            )}

            {/* 1-based index label on picked rects, styled like GridSliceOverlay */}
            {isPicked ? (
              <text
                x={x + 2}
                y={y + labelPx + 1}
                fontSize={labelPx}
                fontFamily="var(--vscode-font-family, sans-serif)"
                fill={DEFAULTS.pickStroke}
                vectorEffect="non-scaling-stroke"
                style={{
                  paintOrder: 'stroke',
                  stroke: 'rgba(0, 0, 0, 0.45)',
                  strokeWidth: 1.5,
                  strokeLinejoin: 'round',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {i + 1}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
