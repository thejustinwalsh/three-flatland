import { directionToAngle, type NormalDirection } from '@three-flatland/normals'

/**
 * Ordered 3×3 compass layout: 8 named directions around a center `'flat'`
 * cell. Canonical NSEW names per `descriptor.ts` (aliases like `'up'` are
 * accepted for input but never produced by the compass).
 */
export const COMPASS_LAYOUT: ReadonlyArray<{
  direction: NormalDirection
  row: 0 | 1 | 2
  col: 0 | 1 | 2
}> = [
  { direction: 'north-west', row: 0, col: 0 },
  { direction: 'north', row: 0, col: 1 },
  { direction: 'north-east', row: 0, col: 2 },
  { direction: 'west', row: 1, col: 0 },
  { direction: 'flat', row: 1, col: 1 },
  { direction: 'east', row: 1, col: 2 },
  { direction: 'south-west', row: 2, col: 0 },
  { direction: 'south', row: 2, col: 1 },
  { direction: 'south-east', row: 2, col: 2 },
]

/**
 * Resolve a direction to a hue in `[0, 360)`, or `null` for `'flat'`
 * (rendered as neutral gray). Hue tracks the direction's angle directly —
 * opposite directions land on complementary hues, adjacent directions on
 * analogous ones, and the mapping is a pure function of angle so it's
 * stable across sessions and identical for named vs. numeric directions
 * that resolve to the same angle.
 */
export function directionHue(direction: NormalDirection | undefined): number | null {
  const angle = directionToAngle(direction)
  if (angle === null) return null
  const deg = (angle * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

export type DirectionColorOptions = {
  saturation?: number
  lightness?: number
  alpha?: number
}

/** Neutral gray for `'flat'` — matches RectOverlay's quiet-chrome tone. */
const FLAT_RGB = { r: 136, g: 136, b: 136 }

/** CSS color for a direction. `'flat'` (or `undefined`) renders neutral gray. */
export function directionColor(
  direction: NormalDirection | undefined,
  opts: DirectionColorOptions = {}
): string {
  const { saturation = 70, lightness = 55, alpha = 1 } = opts
  const hue = directionHue(direction)
  if (hue === null) return `rgba(${FLAT_RGB.r}, ${FLAT_RGB.g}, ${FLAT_RGB.b}, ${alpha})`
  return `hsla(${hue.toFixed(1)}, ${saturation}%, ${lightness}%, ${alpha})`
}

/**
 * Which compass cell (if any) a resolved direction value lands on, by
 * angle equality — so a numeric direction that happens to equal e.g.
 * north-east's angle highlights the same cell a literal `'north-east'`
 * would. Returns `null` when the value is a custom angle that doesn't
 * land on any of the 8 named directions (compass shows no active cell).
 */
export function activeCompassDirection(
  direction: NormalDirection | undefined
): NormalDirection | null {
  const angle = directionToAngle(direction)
  if (angle === null) return 'flat'
  for (const { direction: named } of COMPASS_LAYOUT) {
    if (named === 'flat') continue
    if (directionToAngle(named) === angle) return named
  }
  return null
}
