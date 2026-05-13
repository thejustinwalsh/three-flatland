import { trait } from 'koota'

export type PlannerName = 'greedy' | 'seeker' | 'cautious'
export type DrillerAnimState = 'idle' | 'walk' | 'drillDown' | 'drillUp' | 'drillLeft' | 'drillRight' | 'trip' | 'dodge' | 'fall' | 'ghost'

/**
 * The driller character. There is at most one Driller entity at a time;
 * during respawn the old entity despawns and a new one spawns at the surface.
 */
export const Driller = trait({
  /**
   * Snapped (col, row) — the cell the driller currently OWNS. While
   * walking or falling between two cells, (col, row) holds the SOURCE
   * cell until the continuous (px, py) position arrives within ε of
   * the destination cell's center, at which point we snap to it.
   */
  col: 9,
  row: 0,
  /**
   * Continuous world-pixel position. The renderer reads (px, py)
   * directly — this is THE position. (col, row) is just the snapped
   * cell-grid coordinate derived from it.
   */
  px: 0,
  py: 0,
  /**
   * Movement target cell. While moving, (px, py) advances toward the
   * (destCol, destRow) center at a fixed pixels-per-ms rate. When at
   * rest, destCol === col and destRow === row.
   */
  destCol: 9,
  destRow: 0,
  /** 1 = facing right, -1 = facing left. */
  facing: 1 as 1 | -1,
  /**
   * Drill state. When `drillCooldownMs > 0`, the driller is locked at
   * its current cell playing the drill animation; when it expires the
   * cell at (drillCol, drillRow) is converted to AIR and a movement
   * target is set so the driller can step into the cleared space on
   * subsequent frames.
   *
   * Drilling can ONLY start when the driller is "fully snapped" — at
   * rest at (col, row) with (px, py) on the cell center.
   */
  drillCooldownMs: 0,
  drillCol: 0,
  drillRow: 0,
  /**
   * Pet-pause: gameplay tick after which the driller resumes acting.
   * While `gs.tick < pausedUntilTick`, the driller stays at his cell
   * with an idle animation — the player has petted him and he's
   * enjoying it for a moment. Set by `doPet`; cleared automatically
   * when the tick clock passes the value, or instantly forced to 0
   * on over-pet (when fear takes over and he flees the touch).
   */
  pausedUntilTick: 0,
  /**
   * Queued pet-pause duration in ticks. Petting the driller while he
   * is mid-air (falling) doesn't pause him — gravity wins — but the
   * pause shouldn't be lost either. Instead the duration is queued
   * here and the driller system converts it to `pausedUntilTick` on
   * the first tick the driller is grounded. 0 = no pause queued.
   */
  petPauseQueuedTicks: 0,
})

/**
 * Mood axes — each `0..1`, drift each tick toward an event-derived target.
 * The dominant axis (with hysteresis) selects which planner runs:
 *
 *   greed  → seeker
 *   fear   → cautious
 *   drive  → greedy
 *
 * `planner` is the *currently-active* planner (cached so the selector can
 * apply hysteresis); `switchAtTick` is when it last switched (PLAN_COMMIT_TICKS
 * sunk-cost window referenced from `lib/constants` once that lands).
 *
 * `trust` is an internal-only counter (no UI, no axis) bumped on helpful
 * taps; biases the AI toward gratitude bobs and slightly slower fear decay
 * after evil events. Not persisted across deaths.
 */
export const Mood = trait({
  greed: 0.2,
  fear: 0.1,
  drive: 0.7,
  planner: 'greedy' as PlannerName,
  switchAtTick: 0,
  trust: 0,
})

/**
 * The cell the planner currently wants the driller to reach. Updated by
 * the planner; consumed by the driller motion system.
 */
export const PlannerTarget = trait({
  col: 0,
  row: 0,
  /** Tick this target was reserved on; planner sunk-cost window respects this. */
  reservedAtTick: 0,
})

/**
 * Per-frame animation cursor. Frame counts and timings live in the atlas
 * region map, not here.
 */
export const Animation = trait({
  state: 'idle' as DrillerAnimState,
  frame: 0,
  frameAccumMs: 0,
})
