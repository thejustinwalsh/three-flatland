import { MIN_PLAY_ROWS, PLAY_COLS, SCALE_STEPS, TILE_PX } from '../constants'

export interface PlayCanvasMetrics {
  /** Chosen integer scale step (1, 2, 4, or 8). */
  scale: number
  /** Visible row count at this scale; always >= MIN_PLAY_ROWS when a fitting scale exists. */
  rows: number
  /** Final canvas pixel width = PLAY_COLS * TILE_PX * scale. */
  canvasWidth: number
  /** Final canvas pixel height = rows * TILE_PX * scale. */
  canvasHeight: number
}

/**
 * Pick the largest integer scale from SCALE_STEPS that fits within the
 * given viewport while satisfying the PLAY_COLS × MIN_PLAY_ROWS minimum.
 *
 * Falls back to 1× if no step fits (very small mobile portrait).
 */
export function pickScale(viewportW: number, viewportH: number): number {
  let chosen: number = SCALE_STEPS[0]
  for (const s of SCALE_STEPS) {
    const fitsW = PLAY_COLS * TILE_PX * s <= viewportW
    const fitsH = MIN_PLAY_ROWS * TILE_PX * s <= viewportH
    if (fitsW && fitsH) chosen = s
  }
  return chosen
}

/**
 * Compute the play canvas dimensions for a given viewport. Row count
 * grows with viewport height — taller hosts see more of the world,
 * but column count is always PLAY_COLS.
 */
export function computePlayCanvas(viewportW: number, viewportH: number): PlayCanvasMetrics {
  const scale = pickScale(viewportW, viewportH)
  const rows = Math.max(MIN_PLAY_ROWS, Math.floor(viewportH / (TILE_PX * scale)))
  return {
    scale,
    rows,
    canvasWidth: PLAY_COLS * TILE_PX * scale,
    canvasHeight: rows * TILE_PX * scale,
  }
}
