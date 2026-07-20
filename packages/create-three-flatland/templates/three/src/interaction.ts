/**
 * Pure scene logic, lifted out of the render loop.
 *
 * The animation and pointer maths live here rather than inline in `main.ts` for
 * one reason: a function that takes numbers and returns numbers can be tested
 * without a GPU, a canvas, or a browser. `src/interaction.test.ts` is the whole
 * payoff — and it is the pattern to keep reaching for as this project grows.
 * Anything that does not touch three.js objects belongs in a module like this.
 */

/** Sprite edge length, in world units, for each interaction state. */
export const SPRITE_SCALE = {
  idle: 150,
  hover: 170,
  press: 130,
} as const

/** How far the sprite closes on its target scale each frame, as a fraction. */
export const SCALE_EASING = 0.15

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

/**
 * Frame-rate-naive exponential ease — the standard `a += (b - a) * t` move.
 * `t` is clamped to [0, 1] so a bad easing value can never overshoot the target
 * and oscillate, which reads on screen as a sprite that jitters instead of settling.
 */
export function approach(current: number, target: number, t: number = SCALE_EASING): number {
  const k = Math.min(1, Math.max(0, t))
  return current + (target - current) * k
}

/** The subset of DOMRect this module needs — so tests don't have to build one. */
export interface ViewportRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Client (CSS pixel) coordinates → normalized device coordinates for `Raycaster`.
 *
 * Two things are easy to get wrong here. The Y axis flips: NDC is +1 at the TOP
 * of the viewport while client Y grows downward. And a canvas queried before
 * layout reports a zero-size rect, which would divide by zero and hand the
 * raycaster NaN — silently killing every hit test rather than failing loudly.
 */
export function toPointerNdc(clientX: number, clientY: number, rect: ViewportRect): { x: number; y: number } {
  if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  }
}
