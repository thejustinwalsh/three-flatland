/**
 * Autotile bitmask resolver.
 *
 * For each SOIL cell we compute a 4-bit mask of which orthogonal neighbors
 * are also SOIL. The mask indexes into a sprite atlas row of 16 frames
 * (one per mask value 0..15) and the picked frame visually blends the
 * cell into its neighbors.
 *
 * Bit layout (low → high): N, S, E, W. Examples:
 *   0b0000 (0)  — fully isolated dirt clod (all neighbors AIR)
 *   0b0001 (N)  — soil only above   → bottom-edge piece
 *   0b1110 (SEW) — soil below, right, left → grass-cap candidate (no soil above)
 *   0b1111 (NSEW) — fully surrounded → interior
 */

export const NEIGHBOR_BITS = {
  N: 1 << 0,
  S: 1 << 1,
  E: 1 << 2,
  W: 1 << 3,
} as const

export type IsSoilFn = (col: number, row: number) => boolean

/** Compute the 4-bit autotile mask for a cell using the orthogonal neighbors. */
export function autotileMask(col: number, row: number, isSoil: IsSoilFn): number {
  let m = 0
  if (isSoil(col, row - 1)) m |= NEIGHBOR_BITS.N
  if (isSoil(col, row + 1)) m |= NEIGHBOR_BITS.S
  if (isSoil(col + 1, row)) m |= NEIGHBOR_BITS.E
  if (isSoil(col - 1, row)) m |= NEIGHBOR_BITS.W
  return m
}

/**
 * Atlas index for a 16-tile autotile row. Mask is the index directly.
 *
 * Kept as a separate function so the caller doesn't have to know the
 * convention; if we ever switch to a 47-tile autotile (corner-aware)
 * the convention shifts and only this function needs updating.
 */
export function maskToAtlasIndex(mask: number): number {
  return mask & 0xf
}

/**
 * Whether a cell with this mask should render as a grass cap.
 *
 * Heuristic: top must be exposed (no SOIL above) AND the row is within
 * a small distance of the surface row (so buried soil whose top is
 * exposed by digging doesn't sprout grass). The exact threshold is
 * tunable — 2 cells in this implementation.
 */
export function isGrassCap(mask: number, row: number, surfaceRow: number): boolean {
  return (mask & NEIGHBOR_BITS.N) === 0 && row <= surfaceRow + 2
}
