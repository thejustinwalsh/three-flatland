import type { Intersection } from 'three'

/**
 * The modality that triggered an activation. The cross-mode truth: pointer clicks delegate TO
 * activation, not the reverse, so controller / gaze / switch activation in Modes 3–4 reuse the
 * exact same path with zero per-widget code.
 */
export type A11yActivationSource =
  | 'pointer'
  | 'keyboard'
  | 'screen-reader'
  | 'voice'
  | 'xr-controller'
  | 'gaze'
  | 'hand'
  | 'switch'

/**
 * A semantic activation event dispatched as three's `'activate'`. Geometry is present ONLY when
 * the source actually has it (`pointer` / `xr-controller`); a keyboard/AT activation carries no
 * fake mouse coordinates — that honesty is finding #8 of the spec's adversarial review.
 */
export type A11yActivationEvent = {
  source: A11yActivationSource
  /** DOM event / XRInputSourceEvent when available. */
  nativeEvent?: unknown
  /** Real geometry when `source` is `'pointer'` / `'xr-controller'`; absent otherwise. */
  intersection?: Intersection
  handedness?: 'left' | 'right' | 'none'
  stopPropagation?: () => void
}
