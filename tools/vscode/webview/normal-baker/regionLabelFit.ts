// Pure "what font size fits this region's label" math, split out of
// RegionColorOverlay.tsx so it's testable without mounting SVG.
//
// This is the baker's OWN fit policy, deliberately different from
// tools/preview's `fitLabelFontSize` (RectOverlay's CornerIndex):
// preview's policy is fit-or-HIDE — below a 4px floor the label doesn't
// render at all. Stakeholder direction for the baker is fit-ALWAYS —
// split/generate workflows produce lots of tiny sub-regions and an
// unlabeled region can't be matched to the Regions list, so the font
// keeps shrinking below the aesthetic floor as long as the text still
// physically fits inside the region. Only truly degenerate cases (the
// glyphs would be sub-1.5 image-px noise) hide. The baker therefore
// passes `showLabels={false}` to RectOverlay and draws its own labels.

export type RegionLabelFitOptions = {
  /** Aesthetic font-size floor, in image-px — sizes shrink freely down to this before the fit constraints alone take over. Default 3. */
  floorPx?: number
  /** Font-size ceiling, in image-px. Default 11 (matches preview's ceiling so large regions look unchanged). */
  ceilingPx?: number
  /** Fraction of the region's shorter available side the font targets aesthetically. Default 0.5 (matches preview). */
  fillFraction?: number
  /** Approximate glyph advance width as a fraction of font size, for the monospace label font. Default 0.62. */
  charWidthFraction?: number
  /** Below this rendered size the digits are pixel noise at any zoom — hide instead. Default 1.5. */
  minRenderPx?: number
}

const DEFAULTS: Required<RegionLabelFitOptions> = {
  floorPx: 3,
  ceilingPx: 11,
  fillFraction: 0.5,
  charWidthFraction: 0.62,
  minRenderPx: 1.5,
}

/**
 * Font size (image-px) for a `textLength`-character label inside a
 * `rectW`×`rectH` region. The aesthetic target (ceiling / 50% of the
 * short side) bends down to `floorPx` for small regions, and below that
 * the hard fit constraints (text width, region height) keep shrinking
 * the size so the label still fits INSIDE the region. Returns `null`
 * only when the region is so small the text can't render above
 * `minRenderPx` — every other region gets a label.
 */
export function fitRegionLabelFontSize(
  rectW: number,
  rectH: number,
  textLength: number,
  options: RegionLabelFitOptions = {}
): number | null {
  const { floorPx, ceilingPx, fillFraction, charWidthFraction, minRenderPx } = {
    ...DEFAULTS,
    ...options,
  }
  if (rectW <= 0 || rectH <= 0 || textLength <= 0) return null

  // Padding scales down for tiny regions — a fixed 1px reservation each
  // side would eat half of a 4px region before the text gets a say.
  const paddingPx = Math.min(1, rectW * 0.125, rectH * 0.125)
  const availableW = rectW - paddingPx * 2
  const availableH = rectH - paddingPx * 2
  if (availableW <= 0 || availableH <= 0) return null

  const shortSide = Math.min(availableW, availableH)
  // Aesthetic target, floored: small regions skip straight to the floor
  // instead of hiding (the fit-ALWAYS policy — see module doc).
  const aesthetic = Math.max(Math.min(ceilingPx, shortSide * fillFraction), floorPx)
  // Hard fit constraints — the label must physically sit inside the region.
  const maxForTextWidth = availableW / (textLength * charWidthFraction)
  const size = Math.min(aesthetic, maxForTextWidth, availableH)

  if (size < minRenderPx) return null
  // Round DOWN to quarter-px steps — rounding up could push the rendered
  // text past the fit constraints we just computed.
  return Math.floor(size * 4) / 4
}
