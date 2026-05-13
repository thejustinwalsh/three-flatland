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
  /**
   * Debris hazards are spawned by broken avalanche rocks (after they
   * accumulate 4 crush impacts). They fall to the earth like normal
   * rocks but DO NOT deposit a STONE on landing — they just die.
   * Otherwise the deposited STONE re-clusters with the shrinking
   * avalanche above and the cluster effectively walks down forever
   * instead of disintegrating.
   */
  isDebris: false,
})
