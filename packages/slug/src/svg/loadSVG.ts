import { SlugShapeSet } from '../SlugShapeSet'
import type { SlugShapeHandle } from '../SlugShapeSet'
import { parseSVG } from './parseSVG'
import type { ParsedSVG, ParsedSVGFill, ParseSVGOptions } from './parseSVG'

/** One SVG registered into a shape set: parallel handles + fills. */
export interface RegisteredSVG {
  /** The set the shapes were registered into. */
  set: SlugShapeSet
  /** One handle per painted path, in document order. */
  handles: SlugShapeHandle[]
  /** Fill color + rule per handle (see `ParsedSVGFill`). */
  fills: ParsedSVGFill[]
  viewBox: ParsedSVG['viewBox']
}

/** Register every painted path of a parsed SVG into `set`. */
export function registerSVG(set: SlugShapeSet, parsed: ParsedSVG): RegisteredSVG {
  const handles = parsed.shapes.map((contours) => set.registerShape(contours))
  return { set, handles, fills: parsed.fills, viewBox: parsed.viewBox }
}

/**
 * Load SVG source into a `SlugShapeSet` — the `slug/svg` entry point.
 * `source` is either SVG markup (detected by a `<svg`/`<?xml` prefix) or a
 * URL to fetch. Pass an existing `set` to accumulate many SVGs into one
 * atlas (one future draw call); omit it to start a fresh set.
 *
 * ```ts
 * const set = new SlugShapeSet()
 * const icon = await loadSVGShapes('/icons/activity.svg', set)
 * batch.writeShape(0, icon.handles[0], { scale: 64, color: icon.fills[0].color })
 * ```
 */
export async function loadSVGShapes(
  source: string,
  set: SlugShapeSet = new SlugShapeSet(),
  options?: ParseSVGOptions
): Promise<RegisteredSVG> {
  const trimmed = source.trimStart()
  const isMarkup = trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')
  const svgText = isMarkup ? source : await (await fetch(source)).text()
  return registerSVG(set, parseSVG(svgText, options))
}
