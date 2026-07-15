// Pure slider math — split out of `Slider.tsx` so unit tests can exercise
// the drag/click/step logic without loading the component's StyleX token
// imports (StyleX's `defineVars` throws when evaluated outside the
// `@stylexjs/babel-plugin` transform, which the root vitest config does
// not run — only `tools/vscode/vite.config.ts`'s build does).

/**
 * Recompute a slider's value from its drag anchor — NOT by accumulating
 * per-move deltas against a "last position." Every pointermove passes the
 * ORIGINAL `dragStartClientX`/`dragStartValue`, so a move sequence that
 * jitters or backtracks still resolves to the value the total on-screen
 * distance from drag-start implies. Same anchor-recompute idiom
 * `RectOverlay`'s move-drag and `NumberField`'s drag decorator use, for
 * the same reason: recomputing from a moving "last position" instead of
 * the fixed anchor drifts under repeated small moves.
 */
export function sliderValueFromDrag(
  dragStartValue: number,
  dragStartClientX: number,
  currentClientX: number,
  opts: { min: number; max: number; pxPerUnit: number }
): number {
  const delta = currentClientX - dragStartClientX
  const pxPerUnit = opts.pxPerUnit || 1
  const raw = dragStartValue + delta / pxPerUnit
  return Math.max(opts.min, Math.min(opts.max, raw))
}

export function valueFromTrackX(
  clientX: number,
  rect: { left: number; width: number },
  min: number,
  max: number
): number {
  const t = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
  return min + Math.max(0, Math.min(1, t)) * (max - min)
}

export function applyStep(v: number, step: number): number {
  if (!step) return v
  return Math.round(v / step) * step
}
