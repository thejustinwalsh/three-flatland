/**
 * Corner-aware autotile resolver.
 *
 * Cardinal connectivity controls the four exposed outer edges. A concave
 * corner is added only when both adjacent cardinal neighbors exist but the
 * diagonal between them does not. Enumerating only those valid corner
 * combinations produces the canonical 47-frame blob/autotile set while
 * keeping every world cell to one rendered sprite.
 */

export const NEIGHBOR_BITS = {
  N: 1 << 0,
  S: 1 << 1,
  E: 1 << 2,
  W: 1 << 3,
} as const

export const CORNER_BITS = {
  NW: 1 << 0,
  NE: 1 << 1,
  SW: 1 << 2,
  SE: 1 << 3,
} as const

export interface AutotileFrameSpec {
  cardinalMask: number
  missingCornerMask: number
}

export type IsMatchingTileFn = (col: number, row: number) => boolean

/** Which concave corners are possible for a cardinal mask. */
export function eligibleCornerMask(cardinalMask: number): number {
  const north = (cardinalMask & NEIGHBOR_BITS.N) !== 0
  const south = (cardinalMask & NEIGHBOR_BITS.S) !== 0
  const east = (cardinalMask & NEIGHBOR_BITS.E) !== 0
  const west = (cardinalMask & NEIGHBOR_BITS.W) !== 0
  let mask = 0
  if (north && west) mask |= CORNER_BITS.NW
  if (north && east) mask |= CORNER_BITS.NE
  if (south && west) mask |= CORNER_BITS.SW
  if (south && east) mask |= CORNER_BITS.SE
  return mask
}

/**
 * Stable atlas order: cardinal masks 0..15; within each cardinal mask,
 * valid missing-corner subsets in numeric order. The result is 47 frames.
 */
export const AUTOTILE_FRAME_SPECS: readonly AutotileFrameSpec[] = (() => {
  const frames: AutotileFrameSpec[] = []
  for (let cardinalMask = 0; cardinalMask < 16; cardinalMask++) {
    const eligible = eligibleCornerMask(cardinalMask)
    for (let missingCornerMask = 0; missingCornerMask < 16; missingCornerMask++) {
      if ((missingCornerMask & ~eligible) !== 0) continue
      frames.push({ cardinalMask, missingCornerMask })
    }
  }
  return frames
})()

export const AUTOTILE_FRAME_COUNT = AUTOTILE_FRAME_SPECS.length

const FRAME_INDEX_BY_MASK = new Map(
  AUTOTILE_FRAME_SPECS.map((spec, index) => [
    `${spec.cardinalMask}:${spec.missingCornerMask}`,
    index,
  ])
)

/** Compute the four cardinal connectivity bits for a cell. */
export function autotileMask(col: number, row: number, isMatch: IsMatchingTileFn): number {
  let mask = 0
  if (isMatch(col, row - 1)) mask |= NEIGHBOR_BITS.N
  if (isMatch(col, row + 1)) mask |= NEIGHBOR_BITS.S
  if (isMatch(col + 1, row)) mask |= NEIGHBOR_BITS.E
  if (isMatch(col - 1, row)) mask |= NEIGHBOR_BITS.W
  return mask
}

/** Compute valid concave-corner bits for a cell. */
export function autotileCornerMask(
  col: number,
  row: number,
  cardinalMask: number,
  isMatch: IsMatchingTileFn
): number {
  const eligible = eligibleCornerMask(cardinalMask)
  let mask = 0
  if ((eligible & CORNER_BITS.NW) !== 0 && !isMatch(col - 1, row - 1)) mask |= CORNER_BITS.NW
  if ((eligible & CORNER_BITS.NE) !== 0 && !isMatch(col + 1, row - 1)) mask |= CORNER_BITS.NE
  if ((eligible & CORNER_BITS.SW) !== 0 && !isMatch(col - 1, row + 1)) mask |= CORNER_BITS.SW
  if ((eligible & CORNER_BITS.SE) !== 0 && !isMatch(col + 1, row + 1)) mask |= CORNER_BITS.SE
  return mask
}

/** Resolve a valid cardinal/corner combination to its baked atlas column. */
export function autotileFrameIndex(cardinalMask: number, missingCornerMask = 0): number {
  const cardinal = cardinalMask & 0xf
  const corners = missingCornerMask & eligibleCornerMask(cardinal)
  return FRAME_INDEX_BY_MASK.get(`${cardinal}:${corners}`) ?? 0
}

/** Resolve a cell directly to its corner-aware atlas column. */
export function autotileIndex(col: number, row: number, isMatch: IsMatchingTileFn): number {
  const cardinalMask = autotileMask(col, row, isMatch)
  const missingCornerMask = autotileCornerMask(col, row, cardinalMask, isMatch)
  return autotileFrameIndex(cardinalMask, missingCornerMask)
}

/** Backward-compatible cardinal-only lookup used by topology-free callers. */
export function maskToAtlasIndex(mask: number): number {
  return autotileFrameIndex(mask)
}

export function isGrassCap(mask: number, row: number, surfaceRow: number): boolean {
  return (mask & NEIGHBOR_BITS.N) === 0 && row <= surfaceRow + 2
}
