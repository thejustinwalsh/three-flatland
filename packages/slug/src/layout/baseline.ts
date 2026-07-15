// THE baseline math (risk R4): CSS's line-box model, spelled out once.
//
// A line box is `lineHeight` tall. The CONTENT box inside it is the font
// bounding box — `(ascender - descender) * fontSize` tall, NOT 1 em
// (Inter's is ~1.21 em). Half the difference (the half-leading) pads the
// content box top and bottom, exactly as a browser or Canvas2D does:
//
//   contentHeight = (ascender - descender) * fontSize
//   halfLeading   = (lineHeight - contentHeight) / 2
//   baseline      = halfLeading + ascender * fontSize
//
// Half-leading is NEGATIVE when the content box is taller than the line
// box (Inter at `line-height: 1.2`) — glyphs overflow the line box by
// design, matching the browser.
//
// Slug metrics are em-space and BASELINE-relative (`bounds.yMax` is ink
// top above the baseline, `ascender` is the content-box top above the
// baseline). These three functions are the only place that relationship
// is spelled out; every y in the layout engine and the queries derives
// from them. If baseline placement is ever wrong by a constant, fix it
// HERE — nothing else may re-derive this math.

/**
 * Downward offset from the line-box top to the content-box top: the
 * half-leading. Negative when the content box (`(ascender - descender) *
 * fontSize`) overflows the line box.
 */
export function getHalfLeading(
  ascender: number,
  descender: number,
  fontSize: number,
  lineHeight: number
): number {
  return (lineHeight - (ascender - descender) * fontSize) / 2
}

/**
 * Downward offset from the line-box top to the alphabetic baseline:
 * `halfLeading + ascender * fontSize`. With zero leading (`lineHeight ===
 * (ascender - descender) * fontSize`) this is exactly
 * `fontBoundingBoxAscent`.
 */
export function getLineBaselineOffset(
  ascender: number,
  descender: number,
  fontSize: number,
  lineHeight: number
): number {
  return getHalfLeading(ascender, descender, fontSize, lineHeight) + ascender * fontSize
}

/**
 * Downward offset from the line-box top to a glyph's ink top.
 * `ascender - yMax` is the Slug equivalent of the MSDF glyph `yoffset`.
 */
export function getGlyphTopOffset(
  ascender: number,
  descender: number,
  yMax: number,
  fontSize: number,
  lineHeight: number
): number {
  return getHalfLeading(ascender, descender, fontSize, lineHeight) + (ascender - yMax) * fontSize
}
