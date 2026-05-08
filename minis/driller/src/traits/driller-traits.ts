import { trait } from 'koota'

export type PlannerName = 'greedy' | 'seeker' | 'cautious'
export type DrillerAnimState = 'idle' | 'walk' | 'drillDown' | 'drillUp' | 'drillLeft' | 'drillRight' | 'trip' | 'dodge' | 'fall' | 'ghost'

/**
 * The driller character. There is at most one Driller entity at a time;
 * during respawn the old entity despawns and a new one spawns at the surface.
 */
export const Driller = trait({
  /**
   * Current cell (col, row) — integer. The driller occupies this cell as
   * AIR; the cell directly below (col, row+1) is the SUPPORT they're
   * standing on. If the support cell becomes AIR, gravity drops the
   * driller one row per step interval.
   */
  col: 9,
  row: 0,
  /**
   * The previous cell the driller was in. We snap (col,row) to the
   * destination at the START of a step, then linearly lerp the visible
   * pixel position from (prevCol,prevRow) → (col,row) across the
   * step's cooldown window. This is what gives walking and falling
   * the same uniform per-cell cadence with smooth interpolation.
   */
  prevCol: 9,
  prevRow: 0,
  /** Floating-point world-pixel position; used during smooth animation. */
  px: 0,
  py: 0,
  /** 1 = facing right, -1 = facing left. Determines walk-cycle flip. */
  facing: 1 as 1 | -1,
  /** Cooldown until the next dig action is allowed (ms). */
  digCooldownMs: 0,
  /** Cooldown until next gravity step when falling (ms). */
  fallCooldownMs: 0,
  /**
   * Total duration of the in-flight step (ms). Used to compute the
   * linear lerp progress from prev cell → current cell. 0 when the
   * driller is at rest.
   */
  stepDurationMs: 0,
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
