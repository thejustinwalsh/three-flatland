// THE MSDF-baseline → Slug-ascender conversion (risk R4).
//
// uikit's MSDF `Font` folded the baseline into each glyph's `yoffset` at
// construction time — glyph tops were stored as offsets from the em-box
// top, baked from the atlas's `base`/`lineHeight`. Slug fonts have no such
// fold: metrics are em-space and BASELINE-relative (`bounds.yMax` is ink
// top above the baseline, `ascender` is the em-box top above the
// baseline). These three functions are the only place that relationship
// is spelled out; every y in the layout engine and the queries derives
// from them. If baseline placement is ever wrong by a constant, fix it
// HERE — nothing else may re-derive this math.

/**
 * Downward offset from the line-box top to the em-box top: the em box
 * (`fontSize` tall) is centered inside the `lineHeight` box.
 */
export function getEmBoxTopOffset(fontSize: number, lineHeight: number): number {
  return (lineHeight - fontSize) / 2
}

/**
 * Downward offset from the line-box top to the alphabetic baseline.
 * With `lineHeight === fontSize` this is exactly `ascender * fontSize`,
 * i.e. `fontBoundingBoxAscent`.
 */
export function getLineBaselineOffset(
  ascender: number,
  fontSize: number,
  lineHeight: number
): number {
  return getEmBoxTopOffset(fontSize, lineHeight) + ascender * fontSize
}

/**
 * Downward offset from the line-box top to a glyph's ink top.
 * `ascender - yMax` is the Slug equivalent of the MSDF glyph `yoffset`.
 */
export function getGlyphTopOffset(
  ascender: number,
  yMax: number,
  fontSize: number,
  lineHeight: number
): number {
  return getEmBoxTopOffset(fontSize, lineHeight) + (ascender - yMax) * fontSize
}
