import { useViewport, viewBoxFor } from '@three-flatland/preview'
import type { NormalDirection } from '@three-flatland/normals'
import { directionColor } from './direction'

// `RectOverlay` (tools/preview/src/RectOverlay.tsx) is deliberately
// single-color for every rect — see its CLAUDE.md: "No per-rect color or
// stroke prop." Coloring each region by its resolved direction therefore
// needs its own non-interactive fill layer, rendered as a sibling
// underneath RectOverlay so RectOverlay still owns all pointer
// interaction (select/drag/resize) and its selection chrome draws on top
// of these fills. Shares CanvasStage's pan/zoom via the same
// `useViewport()`/`viewBoxFor()` contract every other overlay uses.

export type RegionColorOverlayProps = {
  regions: ReadonlyArray<{
    id: string
    x: number
    y: number
    w: number
    h: number
    direction: NormalDirection
  }>
}

export function RegionColorOverlay({ regions }: RegionColorOverlayProps) {
  const vp = useViewport()
  if (!vp) return null
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
      {regions.map((r) => (
        <rect
          key={r.id}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={directionColor(r.direction, { alpha: 0.4 })}
          shapeRendering="crispEdges"
        />
      ))}
    </svg>
  )
}
