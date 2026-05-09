import {
  ROCK_AUTOTILE_FRAMES,
  ROCK_AUTOTILE_H,
  ROCK_AUTOTILE_PAD,
  ROCK_AUTOTILE_SLOT,
  ROCK_AUTOTILE_TILE,
  ROCK_AUTOTILE_W,
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
