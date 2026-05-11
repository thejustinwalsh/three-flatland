import { PLAY_COLS, PLAY_ROWS, SCALE_STEPS, TILE_PX } from '../constants'

export interface PlayCanvasMetrics {
  /** Chosen integer scale step (1, 2, 4, or 8). */
  scale: number
  /** Visible row count — always equal to PLAY_ROWS (fixed mobile-portrait shape). */
  rows: number
  /** Final gameplay-rect pixel width = PLAY_COLS * TILE_PX * scale. */
  canvasWidth: number
  /** Final gameplay-rect pixel height = PLAY_ROWS * TILE_PX * scale. */
  canvasHeight: number
}

/**
 * Pick the largest integer scale from SCALE_STEPS such that the fixed
 * PLAY_COLS × PLAY_ROWS gameplay rect fits both dimensions of the
 * viewport. Height-first then width: in practice we check both, but
 * a portrait viewport will hit the height limit first while a
 * landscape viewport will hit the width limit first.
 *
 * Falls back to 1× if no step fits (very small mobile portrait).
 */
export function pickScale(viewportW: number, viewportH: number): number {
  let chosen: number = SCALE_STEPS[0]
  for (const s of SCALE_STEPS) {
    const fitsH = PLAY_ROWS * TILE_PX * s <= viewportH
    const fitsW = PLAY_COLS * TILE_PX * s <= viewportW
    if (fitsH && fitsW) chosen = s
  }
  return chosen
}

/**
 * Compute the gameplay-rect dimensions for a given viewport. Row count
 * is fixed at PLAY_ROWS — the playfield is always a mobile-portrait
 * shape, regardless of host viewport size. The remaining viewport area
 * is filled by the compositor's blurred ambient bg layer.
 */
export function computePlayCanvas(viewportW: number, viewportH: number): PlayCanvasMetrics {
  const scale = pickScale(viewportW, viewportH)
  return {
    scale,
    rows: PLAY_ROWS,
    canvasWidth: PLAY_COLS * TILE_PX * scale,
    canvasHeight: PLAY_ROWS * TILE_PX * scale,
  }
}
