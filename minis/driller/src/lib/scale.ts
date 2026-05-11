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
 * Pick the largest integer scale from SCALE_STEPS such that:
 *   - The full gameplay-rect WIDTH fits the viewport at this scale, AND
 *   - At least HEIGHT_FIT_RATIO of the gameplay-rect HEIGHT fits.
 *
 * The relaxed height check is what lets common desktop viewports
 * (1080p, 1440p) get a 2× or 4× scale even though the fixed
 * mobile-portrait gameplay rect is intentionally taller than wide.
 * The bg compositor fills the cropped-off top/bottom region with
 * the blurred ambient layer, so the viewport never shows raw
 * black there. The gameplay rect is centered; vertical overflow
 * splits evenly above and below the viewport.
 *
 * At 1280×720: 2× → 576w (fits) + 1280h (overflows by 560px = ~44%
 * of rows cropped). Too aggressive — stays at 1×.
 * At 1920×1080: 2× → 576w + 1280h (overflows by 200px = ~15% cropped).
 * Accepted because HEIGHT_FIT_RATIO=0.75 means 75% of rows must fit.
 * At 2560×1440: 4× → 1152w + 2560h. Overflows 1120px (~44%) — too much.
 * Falls back to 2×: 576w + 1280h, easily fits.
 */
const HEIGHT_FIT_RATIO = 0.75

export function pickScale(viewportW: number, viewportH: number): number {
  let chosen: number = SCALE_STEPS[0]
  for (const s of SCALE_STEPS) {
    const fitsW = PLAY_COLS * TILE_PX * s <= viewportW
    const fitsH = PLAY_ROWS * TILE_PX * s * HEIGHT_FIT_RATIO <= viewportH
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
