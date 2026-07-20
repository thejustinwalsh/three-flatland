/**
 * Pure scene logic, lifted out of the render loop.
 *
 * The animation maths live here rather than inline in `App.tsx` for one reason:
 * a function that takes numbers and returns numbers can be tested without a GPU,
 * a canvas, or a React renderer. `src/interaction.test.ts` is the whole payoff —
 * and it is the pattern to keep reaching for as this project grows. Anything
 * that is not a component and does not touch three.js objects belongs in a
 * module like this.
 */

/** Sprite edge length, in world units, for each interaction state. */
export const SPRITE_SCALE = {
  idle: 150,
  hover: 170,
  press: 130,
} as const

/** How far the sprite closes on its target scale each frame, as a fraction. */
export const SCALE_EASING = 0.15

/** Sprite tint per interaction state. R3F accepts a CSS colour string here. */
export const SPRITE_TINT = {
  idle: '#ffffff',
  hover: '#47cca9',
} as const

export interface PointerState {
  hovered: boolean
  pressed: boolean
}

/** The scale the sprite is easing toward. Press wins over hover. */
export function targetScale(state: PointerState): number {
  if (state.pressed) return SPRITE_SCALE.press
  if (state.hovered) return SPRITE_SCALE.hover
  return SPRITE_SCALE.idle
}

/** The tint for the current pointer state. */
export function tintFor(state: PointerState): string {
  return state.hovered ? SPRITE_TINT.hover : SPRITE_TINT.idle
}

/**
 * Frame-rate-naive exponential ease — the standard `a += (b - a) * t` move.
 * `t` is clamped to [0, 1] so a bad easing value can never overshoot the target
 * and oscillate, which reads on screen as a sprite that jitters instead of settling.
 */
export function approach(current: number, target: number, t: number = SCALE_EASING): number {
  const k = Math.min(1, Math.max(0, t))
  return current + (target - current) * k
}
