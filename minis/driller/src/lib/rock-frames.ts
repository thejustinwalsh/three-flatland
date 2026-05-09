import {
  ROCK_AUTOTILE_FRAMES,
  ROCK_AUTOTILE_H,
  ROCK_AUTOTILE_PAD,
  ROCK_AUTOTILE_SLOT,
  ROCK_AUTOTILE_TILE,
  ROCK_AUTOTILE_W,
  ROCK_CORNER_NE_FRAME,
  ROCK_CORNER_NW_FRAME,
  ROCK_CORNER_SE_FRAME,
  ROCK_CORNER_SW_FRAME,
} from '../textures'

/**
 * Spritely API frame shape — matches `three-flatland`'s `SpriteFrame`
 * minimal subset (we don't use pivot / rotation / trim).
 */
export interface RockFrame {
  name: string
  /** Normalized 0..1 atlas coordinates of the inner content area. */
  x: number
  y: number
  width: number
  height: number
  /** Source pixel dimensions of the frame (the inner content tile). */
  sourceWidth: number
  sourceHeight: number
}

/**
 * 16 normalized UV rectangles into the rock-autotile atlas, indexed
 * by the 4-bit autotile mask (mask 0 = no neighbors, mask 15 = full
 * interior). Each rect skips the 2px transparent gutter on each side
 * of the slot — the gutter exists for bleed-prevention under sub-
 * pixel filter modes; we point UVs at the inner content only.
 *
 * UV math (per frame N):
 *   x_n = (N * SLOT + PAD) / W
 *   y_n = PAD / H
 *   w_n = TILE / W
 *   h_n = TILE / H
 */
export const ROCK_FRAMES: ReadonlyArray<RockFrame> = (() => {
  const frames: RockFrame[] = []
  for (let n = 0; n < ROCK_AUTOTILE_FRAMES; n++) {
    frames.push({
      name: `rock-${n.toString(16)}`,
      x: (n * ROCK_AUTOTILE_SLOT + ROCK_AUTOTILE_PAD) / ROCK_AUTOTILE_W,
      y: ROCK_AUTOTILE_PAD / ROCK_AUTOTILE_H,
      width: ROCK_AUTOTILE_TILE / ROCK_AUTOTILE_W,
      height: ROCK_AUTOTILE_TILE / ROCK_AUTOTILE_H,
      sourceWidth: ROCK_AUTOTILE_TILE,
      sourceHeight: ROCK_AUTOTILE_TILE,
    })
  }
  return frames
})()

/**
 * 4-bit corner mask — bit 0 = NW, 1 = NE, 2 = SW, 3 = SE. Set when
 * the cell has BOTH adjacent cardinal stones AND a missing diagonal,
 * i.e. an inside-of-an-L corner. Renderer composites the matching
 * overlay frame on top of the base.
 */
export const CORNER_NW = 1 << 0
export const CORNER_NE = 1 << 1
export const CORNER_SW = 1 << 2
export const CORNER_SE = 1 << 3

export type IsStoneFn = (col: number, row: number) => boolean

/**
 * Return the 4-bit corner mask for `(col, row)`. A corner bit is set
 * iff the cell has BOTH cardinals adjacent to that corner (e.g. for
 * NW: N and W both stones) AND the diagonal cell at that corner is
 * NOT a stone. Out-of-bounds cells count as non-stone.
 */
export function cornerMask(col: number, row: number, isStone: IsStoneFn): number {
  const n = isStone(col, row - 1)
  const s = isStone(col, row + 1)
  const e = isStone(col + 1, row)
  const w = isStone(col - 1, row)
  let m = 0
  if (n && w && !isStone(col - 1, row - 1)) m |= CORNER_NW
  if (n && e && !isStone(col + 1, row - 1)) m |= CORNER_NE
  if (s && w && !isStone(col - 1, row + 1)) m |= CORNER_SW
  if (s && e && !isStone(col + 1, row + 1)) m |= CORNER_SE
  return m
}

/** Frame indices for the four corner overlays, parallel to CORNER_*. */
export const CORNER_FRAME_INDEX: ReadonlyArray<number> = [
  ROCK_CORNER_NW_FRAME,
  ROCK_CORNER_NE_FRAME,
  ROCK_CORNER_SW_FRAME,
  ROCK_CORNER_SE_FRAME,
]
