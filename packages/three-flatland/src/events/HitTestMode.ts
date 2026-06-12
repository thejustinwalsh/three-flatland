// Types the build-time `process.env` read without requiring @types/node
// (shadows the global where present; erased at compile).
declare const process: { env: { NODE_ENV?: string } }

/** Hit-testing strategy for pointer raycasts. See spec §6. */
export type HitTestMode = 'radius' | 'bounds' | 'alpha' | 'none'

export const ALL_HIT_TEST_MODES: readonly HitTestMode[] = ['radius', 'bounds', 'alpha', 'none']

/**
 * Resolve a requested mode against a class's supported set, falling
 * back (bounds → radius → first supported) with a dev-only warning.
 */
export function resolveHitTestMode(
  requested: HitTestMode,
  supported: readonly HitTestMode[],
  className: string
): HitTestMode {
  if (supported.includes(requested)) return requested
  const fallback = supported.includes('bounds')
    ? 'bounds'
    : supported.includes('radius')
      ? 'radius'
      : supported[0]!
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `three-flatland: ${className} does not support hitTestMode '${requested}', using '${fallback}'`
    )
  }
  return fallback
}
