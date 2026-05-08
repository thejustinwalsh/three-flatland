import { TILE_FIXTURE_BASE, TILE_SOIL, TILE_STONE } from '../traits'

/**
 * A connected-component of SOIL cells, plus its bounding box and cell list.
 *
 * `cells` are flat indices into the tile array (`row * cols + col`).
 */
export interface SoilChunk {
  cells: number[]
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

/**
 * 4-connected flood-fill over a tile array. Returns one SoilChunk per
 * distinct SOIL component. Cost: O(cells). Uses an iterative stack so we
 * don't blow the call stack on large chunks.
 */
export function detectChunks(tiles: Uint8Array, cols: number, rows: number): SoilChunk[] {
  const seen = new Uint8Array(tiles.length)
  const chunks: SoilChunk[] = []
  const stack: number[] = []

  for (let i = 0; i < tiles.length; i++) {
    if (seen[i] || tiles[i] !== TILE_SOIL) continue
    const cells: number[] = []
    let minR = Infinity
    let maxR = -Infinity
    let minC = Infinity
    let maxC = -Infinity

    stack.length = 0
    stack.push(i)
    seen[i] = 1

    while (stack.length) {
      const idx = stack.pop()!
      cells.push(idx)
      const c = idx % cols
      const r = (idx - c) / cols
      if (r < minR) minR = r
      if (r > maxR) maxR = r
      if (c < minC) minC = c
      if (c > maxC) maxC = c

      // 4-neighbors
      if (c > 0) {
        const ni = idx - 1
        if (!seen[ni] && tiles[ni] === TILE_SOIL) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
      if (c < cols - 1) {
        const ni = idx + 1
        if (!seen[ni] && tiles[ni] === TILE_SOIL) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
      if (r > 0) {
        const ni = idx - cols
        if (!seen[ni] && tiles[ni] === TILE_SOIL) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
      if (r < rows - 1) {
        const ni = idx + cols
        if (!seen[ni] && tiles[ni] === TILE_SOIL) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
    }

    chunks.push({ cells, minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC })
  }
  return chunks
}

/**
 * Whether a SOIL chunk is supported. A chunk is supported if any cell:
 *
 *   - touches the world's left or right edge (column 0 or cols-1)
 *   - touches the world's bottom edge (row rows-1)
 *   - is 4-adjacent to a STONE or FIXTURE_* tile
 *
 * Note: top-edge anchoring is intentionally NOT included — soil at the
 * top of the world should fall if nothing holds it.
 */
export function isSupported(
  chunk: SoilChunk,
  tiles: Uint8Array,
  cols: number,
  rows: number,
): boolean {
  for (const idx of chunk.cells) {
    const c = idx % cols
    const r = (idx - c) / cols
    if (c === 0 || c === cols - 1) return true
    if (r === rows - 1) return true

    const ns = [idx - 1, idx + 1, idx - cols, idx + cols]
    for (const ni of ns) {
      if (ni < 0 || ni >= tiles.length) continue
      const t = tiles[ni]!
      if (t === TILE_STONE) return true
      if (t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 8) return true
    }
  }
  return false
}
