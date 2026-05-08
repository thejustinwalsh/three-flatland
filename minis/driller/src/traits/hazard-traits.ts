import { trait } from 'koota'

/**
 * A telegraphed falling-rock hazard. Spawned periodically above the
 * driller's position; flashes for `warningTicks`, then falls to ground
 * (one cell per gravity tick). Crushes the driller on impact.
 *
 * Phase machine:
 *   warning → falling → landed (despawned)
 */
export type HazardPhase = 'warning' | 'falling' | 'landed'

export const Hazard = trait({
  col: 0,
  /** Floating-point world-pixel Y for smooth fall animation. */
  py: 0,
  vy: 0,
  phase: 'warning' as HazardPhase,
  /** Tick at which the hazard transitions into falling. */
  fallAtTick: 0,
})
