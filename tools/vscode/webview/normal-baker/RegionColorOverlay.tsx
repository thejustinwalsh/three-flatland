import { useViewport, viewBoxFor } from '@three-flatland/preview'
import type { NormalDirection } from '@three-flatland/normals'
import { directionColor } from './direction'
import { fitRegionLabelFontSize } from './regionLabelFit'

// `RectOverlay` (tools/preview/src/RectOverlay.tsx) is deliberately
// single-color for every rect — see its AGENTS.md: "No per-rect color or
// stroke prop." Coloring each region by its resolved direction therefore
// needs its own non-interactive fill layer, rendered as a sibling
// underneath RectOverlay so RectOverlay still owns all pointer
// interaction (select/drag/resize) and its selection chrome draws on top
// of these fills. Shares CanvasStage's pan/zoom via the same
// `useViewport()`/`viewBoxFor()` contract every other overlay uses.
//
// This layer also owns the region index labels (App passes
// `showLabels={false}` to RectOverlay): the baker wants the fit-ALWAYS
// label policy from ./regionLabelFit.ts, not preview's fit-or-hide —
// see that module's doc for the policy difference.

export type RegionColorOverlayProps = {
  regions: ReadonlyArray<{
    id: string
    x: number
    y: number
    w: number
    h: number
    direction: NormalDirection
  }>
  selectedIds: ReadonlySet<string>
}

/** Region index digits, top-left corner, sized by the fit-ALWAYS policy. Mirrors preview's CornerIndex styling (selection yellow, dark halo) so the swap is invisible except for tiny regions gaining labels. */
function RegionLabel({
  rect,
  index,
  selected,
}: {
  rect: { x: number; y: number; w: number; h: number }
  index: number
  selected: boolean
}) {
  const text = String(index)
  const fontPx = fitRegionLabelFontSize(rect.w, rect.h, text.length)
  if (fontPx == null) return null

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
      {text}
    </text>
  )
}

export function RegionColorOverlay({ regions, selectedIds }: RegionColorOverlayProps) {
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
      {/* Labels after all fills so a neighboring region's fill never
          paints over a label near a shared edge. */}
      {regions.map((r, i) => (
        <RegionLabel key={r.id} rect={r} index={i} selected={selectedIds.has(r.id)} />
      ))}
    </svg>
  )
}
