// Pure grid-spec math — extracted from GridSliceOverlay.tsx (C3) so
// non-React consumers (and their node-environment vitest suites) can use
// the grid model without pulling the component barrel, whose dragKit →
// design-system token imports require the StyleX compile step. Exported
// both from the root barrel (unchanged surface for existing consumers)
// and the `@three-flatland/preview/grid` subpath (dependency-free).

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
  gutterY = 0
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
  gutterY = 0
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
  gutterY: number
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
