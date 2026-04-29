import { useViewport, viewBoxFor } from './Viewport'
import type { Rect } from './RectOverlay'

export type AnimationRectHighlightProps = {
  /** The atlas rect to highlight, or null when no highlight should render. */
  rect: Pick<Rect, 'x' | 'y' | 'w' | 'h'> | null
}

/**
 * SVG overlay drawing a distinct accent on a single atlas rect — the
 * one referenced by the currently-active animation frame. Sits ABOVE
 * `<RectOverlay>` in the canvas stage so its chrome is never hidden
 * by the editing rect borders. Color (`#ff5c8a`) is intentionally
 * distinct from selection-yellow and focus-ring blue so a user can
 * see at a glance "this is the animation frame, not my rect
 * selection". Renders nothing when `rect` is null.
 */
export function AnimationRectHighlight({ rect }: AnimationRectHighlightProps) {
  const vp = useViewport()
  if (!vp || !rect) return null
  const stroke = '#ff5c8a'
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
      aria-hidden="true"
    >
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill="rgba(255, 92, 138, 0.1)"
        stroke={stroke}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        shapeRendering="crispEdges"
      />
    </svg>
  )
}
