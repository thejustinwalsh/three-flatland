// Transform-based scripts (§2.7): sub/superscripts are a scale + offset
// applied |level| times, sourced from the font when it carries OS/2 script
// metrics (SlugFont does) and from typical defaults otherwise.

import type { SlugTypeface } from './types.js'

/** Fallback script transforms for typefaces without OS/2 script metrics. */
const DEFAULT_SCRIPT_SCALE = { x: 0.65, y: 0.65 }
const DEFAULT_SUPERSCRIPT_OFFSET = { x: 0, y: 0.34 }
const DEFAULT_SUBSCRIPT_OFFSET = { x: 0, y: -0.15 }

/** The optional OS/2 script-metric surface a typeface may carry. */
interface ScriptMetricsSource {
  subscriptScale?: { x: number; y: number }
  subscriptOffset?: { x: number; y: number }
  superscriptScale?: { x: number; y: number }
  superscriptOffset?: { x: number; y: number }
}

export interface SlugScriptTransform {
  /** Horizontal advance scale. */
  scaleX: number
  /** Vertical (glyph size) scale. */
  scaleY: number
  /** Em-space baseline shift, positive raises (superscript). */
  baselineShift: number
}

const IDENTITY: SlugScriptTransform = { scaleX: 1, scaleY: 1, baselineShift: 0 }

/**
 * Cumulative script transform for a run's `scriptLevel`: positive =
 * superscript, negative = subscript, |level| clamped to 3, applied
 * |level| times per §2.7. `baselineShift` is em-space relative to the
 * run's unscripted fontSize — layout consumes the scales, renderers the
 * shift.
 */
export function getScriptTransform(
  typeface: SlugTypeface,
  scriptLevel: number
): SlugScriptTransform {
  if (!scriptLevel) return IDENTITY
  const depth = Math.min(Math.abs(Math.trunc(scriptLevel)), 3)
  const source = typeface as ScriptMetricsSource
  const scale =
    (scriptLevel > 0 ? source.superscriptScale : source.subscriptScale) ?? DEFAULT_SCRIPT_SCALE
  const offset =
    (scriptLevel > 0 ? source.superscriptOffset : source.subscriptOffset) ??
    (scriptLevel > 0 ? DEFAULT_SUPERSCRIPT_OFFSET : DEFAULT_SUBSCRIPT_OFFSET)

  let scaleX = 1
  let scaleY = 1
  let baselineShift = 0
  for (let i = 0; i < depth; i++) {
    // The offset at each level is expressed in the em of the level above.
    baselineShift += offset.y * scaleY
    scaleX *= scale.x
    scaleY *= scale.y
  }
  return { scaleX, scaleY, baselineShift }
}
