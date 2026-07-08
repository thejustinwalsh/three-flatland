// Pure "does this label fit its region" math, split out of RectOverlay.tsx
// so it's testable without mounting SVG. Stakeholder complaint: region
// index numbers overflow tiny regions at high region counts (up to 100+
// regions on a small tileset). Fix is fit-or-hide, not "always draw" —
// a number that can't be read cleanly is worse than no number.

export type LabelFitOptions = {
  /** Font size floor, in image-px — below this the digits are illegible even before considering zoom, so hide instead. Default 4. */
  floorPx?: number
  /** Font size ceiling, in image-px — a label on a huge region shouldn't grow without bound. Default 11 (matches the prior fixed default for a ~1300px-wide sheet). */
  ceilingPx?: number
  /** Fraction of the region's shorter side the font is allowed to occupy. Default 0.5. */
  fillFraction?: number
  /** Approximate glyph advance width as a fraction of font size, for the monospace label font. Default 0.62 (Commit Mono / JetBrains Mono ballpark). */
  charWidthFraction?: number
  /** Padding (in image-px) reserved on each side so the label doesn't touch the region's own border stroke. Default 1. */
  paddingPx?: number
}

const DEFAULTS: Required<LabelFitOptions> = {
  floorPx: 4,
  ceilingPx: 11,
  fillFraction: 0.5,
  charWidthFraction: 0.62,
  paddingPx: 1,
}

/**
 * Font size (image-px) for a label of `textLength` characters inside a
 * `rectW`×`rectH` region, or `null` if it can't fit even at the floor
 * size — callers should skip rendering the label entirely rather than
 * draw illegible or overflowing text. Never returns a size whose
 * estimated rendered width would exceed the region's own width.
 */
export function fitLabelFontSize(
  rectW: number,
  rectH: number,
  textLength: number,
  options: LabelFitOptions = {}
): number | null {
  const { floorPx, ceilingPx, fillFraction, charWidthFraction, paddingPx } = {
    ...DEFAULTS,
    ...options,
  }
  if (rectW <= 0 || rectH <= 0 || textLength <= 0) return null

  const availableW = Math.max(0, rectW - paddingPx * 2)
  const availableH = Math.max(0, rectH - paddingPx * 2)
  if (availableW <= 0 || availableH <= 0) return null

  const shortSide = Math.min(availableW, availableH)
  const targetForShape = Math.min(ceilingPx, shortSide * fillFraction)
  const maxForTextWidth = availableW / (textLength * charWidthFraction)

  const size = Math.min(targetForShape, maxForTextWidth)
  if (size < floorPx) return null
  return Math.round(size)
}
