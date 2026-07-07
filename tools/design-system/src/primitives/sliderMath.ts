// Pure drag math for `Slider.tsx`, split out so pointer-event sequences can
// be unit-tested without a DOM. The slider is a "scrub" control (same
// convention as `NumberField`'s vertical drag handle, just horizontal):
// dragging doesn't jump to the pointer's absolute position, it offsets the
// value that was current when the drag started by the pointer's
// displacement since then.

export type SliderRange = {
  min: number
  max: number
  step: number
}

export type SliderDragStart = {
  /** The param value at the moment `pointerdown` fired. */
  value: number
  /** `clientX` at the moment `pointerdown` fired. */
  clientX: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function snapToStep(value: number, range: SliderRange): number {
  if (range.step <= 0) return clamp(value, range.min, range.max)
  const steps = Math.round((value - range.min) / range.step)
  return clamp(range.min + steps * range.step, range.min, range.max)
}

/**
 * Value for a pointer at `currentClientX`, given the drag's start snapshot.
 * Recomputed fresh from `start` every call — NOT applied incrementally on
 * top of the previous move's result — so a sequence of `pointermove`
 * events during one drag always reflects the TOTAL displacement since
 * `pointerdown`, never compounding across moves.
 */
export function computeDragValue(
  start: SliderDragStart,
  range: SliderRange,
  currentClientX: number,
  trackWidthPx: number
): number {
  if (trackWidthPx <= 0) return clamp(start.value, range.min, range.max)
  const deltaPx = currentClientX - start.clientX
  const deltaRatio = deltaPx / trackWidthPx
  const deltaValue = deltaRatio * (range.max - range.min)
  return snapToStep(start.value + deltaValue, range)
}

/** Fill ratio (0..1) for rendering the track's filled portion + thumb position. */
export function ratioForValue(value: number, range: SliderRange): number {
  if (range.max === range.min) return 0
  return clamp((value - range.min) / (range.max - range.min), 0, 1)
}
