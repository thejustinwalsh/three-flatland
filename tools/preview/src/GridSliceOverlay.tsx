import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useViewport } from './Viewport'

export type GridSpec = {
  /** Vertical line x-positions, length = cols + 1, monotonically increasing in [0, imageW]. */
  colEdges: number[]
  /** Horizontal line y-positions, length = rows + 1, monotonically increasing in [0, imageH]. */
  rowEdges: number[]
}

/** Stable key for a picked cell. */
export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

export function cellExtent(grid: GridSpec, row: number, col: number) {
  const x = grid.colEdges[col]!
  const y = grid.rowEdges[row]!
  const w = grid.colEdges[col + 1]! - x
  const h = grid.rowEdges[row + 1]! - y
  return { x, y, w, h }
}

export type GridSliceOverlayProps = {
  grid: GridSpec
  /** Set of `cellKey(row, col)` strings. */
  picked: ReadonlySet<string>
  onGridChange: (next: GridSpec) => void
  onPickToggle: (row: number, col: number, additive: boolean) => void

  /** Visual styling overrides — defaults read from VSCode theme. */
  lineColor?: string
  lineActiveColor?: string
}

type LineDrag = {
  axis: 'col' | 'row'
  index: number
  pointerId: number
}

const DEFAULTS = {
  lineColor: 'var(--vscode-panel-border, var(--vscode-editorGroup-border, transparent))',
  lineActiveColor: 'var(--vscode-focusBorder, #007acc)',
  pickFill: 'rgba(255, 204, 0, 0.22)',
  hoverFill: 'rgba(255, 204, 0, 0.08)',
  pickStroke: '#ffcc00',
}

/**
 * SVG overlay for grid slicing. Sibling to <RectOverlay> inside
 * <CanvasStage>. Uses the same viewBox/preserveAspectRatio so its coords
 * are image-pixel coords. Sub-elements opt into pointer events; the SVG
 * root has `pointer-events: none` so the underlying canvas stays
 * interactable elsewhere.
 *
 * Interactions:
 *   - Drag a vertical/horizontal line to adjust a single edge. Clamped
 *     between its neighbors (min 1px gap). Outer edges clamp to image
 *     bounds.
 *   - Click a cell to toggle pick/unpick. Shift-click extends selection.
 */
export function GridSliceOverlay({
  grid,
  picked,
  onGridChange,
  onPickToggle,
  lineColor = DEFAULTS.lineColor,
  lineActiveColor = DEFAULTS.lineActiveColor,
}: GridSliceOverlayProps) {
  const vp = useViewport()
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<LineDrag | null>(null)
  const [hoverCell, setHoverCell] = useState<string | null>(null)

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
        x: Math.max(0, Math.min(vp.imageW, local.x)),
        y: Math.max(0, Math.min(vp.imageH, local.y)),
      }
    },
    [vp],
  )

  if (!vp) return null

  const cols = grid.colEdges.length - 1
  const rows = grid.rowEdges.length - 1

  // Hit-strip width in image-px so lines remain easy to grab at any zoom.
  // 1.5% of the smaller image dimension, min 4px, max 8px image-units.
  const hitWidth = Math.max(4, Math.min(8, Math.round(Math.min(vp.imageW, vp.imageH) * 0.015)))

  const handleLinePointerDown = (axis: 'col' | 'row', index: number) =>
    (e: ReactPointerEvent<SVGElement>) => {
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDrag({ axis, index, pointerId: e.pointerId })
    }

  const handleLinePointerMove = (e: ReactPointerEvent<SVGElement>) => {
    if (!drag) return
    if (e.pointerId !== drag.pointerId) return
    const p = toImagePx(e)
    if (!p) return
    if (drag.axis === 'col') {
      const i = drag.index
      const lower = i > 0 ? grid.colEdges[i - 1]! + 1 : 0
      const upper = i < cols ? grid.colEdges[i + 1]! - 1 : vp.imageW
      const v = Math.max(lower, Math.min(upper, Math.round(p.x)))
      if (v === grid.colEdges[i]) return
      const next = grid.colEdges.slice()
      next[i] = v
      onGridChange({ ...grid, colEdges: next })
    } else {
      const i = drag.index
      const lower = i > 0 ? grid.rowEdges[i - 1]! + 1 : 0
      const upper = i < rows ? grid.rowEdges[i + 1]! - 1 : vp.imageH
      const v = Math.max(lower, Math.min(upper, Math.round(p.y)))
      if (v === grid.rowEdges[i]) return
      const next = grid.rowEdges.slice()
      next[i] = v
      onGridChange({ ...grid, rowEdges: next })
    }
  }

  const handleLinePointerUp = (e: ReactPointerEvent<SVGElement>) => {
    if (!drag) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    setDrag(null)
  }

  const isDragVerticalI = (i: number) => drag?.axis === 'col' && drag.index === i
  const isDragHorizontalI = (i: number) => drag?.axis === 'row' && drag.index === i

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
      {/* Cell hit areas — render first so grid lines (drawn after) sit on top
          and remain grabbable even when a cell is picked. */}
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const ext = cellExtent(grid, r, c)
          const key = cellKey(r, c)
          const isPicked = picked.has(key)
          const isHover = hoverCell === key
          const fill = isPicked ? DEFAULTS.pickFill : isHover ? DEFAULTS.hoverFill : 'transparent'
          return (
            <g key={key}>
              <rect
                x={ext.x}
                y={ext.y}
                width={ext.w}
                height={ext.h}
                fill={fill}
                stroke={isPicked ? DEFAULTS.pickStroke : 'none'}
                strokeWidth={isPicked ? 1 : 0}
                vectorEffect="non-scaling-stroke"
                shapeRendering="crispEdges"
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onPointerEnter={() => setHoverCell(key)}
                onPointerLeave={() =>
                  setHoverCell((cur) => (cur === key ? null : cur))
                }
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onPickToggle(r, c, e.shiftKey)
                }}
              />
              {isPicked ? (
                <text
                  x={ext.x + 2}
                  y={ext.y + Math.max(8, Math.round(vp.imageW / 80))}
                  fontSize={Math.max(8, Math.round(vp.imageW / 80))}
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
                  {r * cols + c}
                </text>
              ) : null}
            </g>
          )
        }),
      )}

      {/* Vertical (column) lines — there are cols + 1. */}
      {grid.colEdges.map((x, i) => {
        const active = isDragVerticalI(i)
        return (
          <g key={`v${i}`}>
            <line
              x1={x}
              y1={0}
              x2={x}
              y2={vp.imageH}
              stroke={active ? lineActiveColor : lineColor}
              strokeWidth={active ? 2 : 1}
              vectorEffect="non-scaling-stroke"
              shapeRendering="crispEdges"
              style={{ pointerEvents: 'none' }}
            />
            <rect
              x={x - hitWidth / 2}
              y={0}
              width={hitWidth}
              height={vp.imageH}
              fill="transparent"
              style={{ pointerEvents: 'all', cursor: 'col-resize' }}
              onPointerDown={handleLinePointerDown('col', i)}
              onPointerMove={handleLinePointerMove}
              onPointerUp={handleLinePointerUp}
              onPointerCancel={handleLinePointerUp}
            />
          </g>
        )
      })}

      {/* Horizontal (row) lines — there are rows + 1. */}
      {grid.rowEdges.map((y, i) => {
        const active = isDragHorizontalI(i)
        return (
          <g key={`h${i}`}>
            <line
              x1={0}
              y1={y}
              x2={vp.imageW}
              y2={y}
              stroke={active ? lineActiveColor : lineColor}
              strokeWidth={active ? 2 : 1}
              vectorEffect="non-scaling-stroke"
              shapeRendering="crispEdges"
              style={{ pointerEvents: 'none' }}
            />
            <rect
              x={0}
              y={y - hitWidth / 2}
              width={vp.imageW}
              height={hitWidth}
              fill="transparent"
              style={{ pointerEvents: 'all', cursor: 'row-resize' }}
              onPointerDown={handleLinePointerDown('row', i)}
              onPointerMove={handleLinePointerMove}
              onPointerUp={handleLinePointerUp}
              onPointerCancel={handleLinePointerUp}
            />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Generate a uniform GridSpec from cell-pixel sizes. Edges run from
 * offset to (offset + N * (cell + gutter)), clamped at image bounds.
 */
export function gridFromCellSize(
  imageW: number,
  imageH: number,
  cellW: number,
  cellH: number,
  offsetX = 0,
  offsetY = 0,
  gutterX = 0,
  gutterY = 0,
): GridSpec {
  const cols = Math.max(1, Math.floor((imageW - offsetX + gutterX) / (cellW + gutterX)))
  const rows = Math.max(1, Math.floor((imageH - offsetY + gutterY) / (cellH + gutterY)))
  return gridUniform(imageW, imageH, cols, rows, cellW, cellH, offsetX, offsetY, gutterX, gutterY)
}

/**
 * Generate a uniform GridSpec from a row/column count. Cell size is
 * derived from `(image - offset - (N-1)*gutter) / N`.
 */
export function gridFromRowCol(
  imageW: number,
  imageH: number,
  cols: number,
  rows: number,
  offsetX = 0,
  offsetY = 0,
  gutterX = 0,
  gutterY = 0,
): GridSpec {
  const cw = Math.floor((imageW - offsetX - (cols - 1) * gutterX) / cols)
  const rh = Math.floor((imageH - offsetY - (rows - 1) * gutterY) / rows)
  return gridUniform(imageW, imageH, cols, rows, cw, rh, offsetX, offsetY, gutterX, gutterY)
}

function gridUniform(
  imageW: number,
  imageH: number,
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  offsetX: number,
  offsetY: number,
  gutterX: number,
  gutterY: number,
): GridSpec {
  const colEdges: number[] = []
  for (let i = 0; i <= cols; i++) {
    const v = offsetX + i * cellW + Math.max(0, i) * gutterX
    colEdges.push(Math.min(imageW, Math.max(0, v)))
  }
  const rowEdges: number[] = []
  for (let i = 0; i <= rows; i++) {
    const v = offsetY + i * cellH + Math.max(0, i) * gutterY
    rowEdges.push(Math.min(imageH, Math.max(0, v)))
  }
  return { colEdges, rowEdges }
}
