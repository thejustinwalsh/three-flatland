// @three-flatland/slug/text — the run-based Slug text engine.
//
// Measure, lay out, and query paragraphs of styled runs using nothing but
// a SlugTypeface's metrics. Rich text is the core model, not a phase
// (Slug manual §4.6/§4.7); caret and hit-testing are first-class
// (LocateSlug / TestSlug). All coordinates are paragraph space: origin at
// the block's top-left, +y down (D6) — convert to three.js y-up via
// `paragraphYToWorldY`.

export { layoutParagraph, measureParagraph } from './layout.js'
export { hitTest, locateCaret, selectRange } from './query.js'
export { getScriptTransform } from './script.js'
export type { SlugScriptTransform } from './script.js'
export { paragraphYToWorldY } from '../layout/worldSpace.js'
export { getEmBoxTopOffset, getGlyphTopOffset, getLineBaselineOffset } from '../layout/baseline.js'
export type {
  SlugTypeface,
  SlugRun,
  SlugParagraphStyle,
  SlugParagraph,
  SlugCharacter,
  SlugLine,
  SlugSpan,
  SlugHit,
  SlugCaret,
} from './types.js'
