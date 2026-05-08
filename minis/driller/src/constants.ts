/**
 * Compile-time constants. Values referenced from spec
 * `planning/superpowers/specs/2026-05-07-driller-mini-design.md`.
 */

/** Source tile size in pixels (1×). */
export const TILE_PX = 16

/** Fixed gameplay column count. The world is always 18 cells wide. */
export const PLAY_COLS = 18

/** Minimum visible row count; taller viewports show more. */
export const MIN_PLAY_ROWS = 22

/**
 * Logical playfield bounds. The playfield is anchored to the driller —
 * `PLAYFIELD_TOP_OFFSET_ROWS` rows above is the LOGICAL top (where rocks
 * spawn from, regardless of viewport size). Rows above the logical top
 * are "out of play" and rendered with a darkening overlay so a taller
 * viewport can't be exploited for hazard-dodging room.
 *
 * The downward reveal is unchanged: tiles stream in `DOWNWARD_REVEAL_ROWS`
 * rows ahead of the driller via the chunk streamer in `generation.ts`.
 */
export const PLAYFIELD_TOP_OFFSET_ROWS = 8

/** Allowed integer pixel-scale steps (largest fitting one is chosen). */
export const SCALE_STEPS = [1, 2, 4, 8] as const

/** Vertical chunk height in rows. World streams in chunks of this size. */
export const CHUNK_ROWS = 32

/** Maximum number of chunks active in the simulation at once. */
export const ACTIVE_CHUNK_CAP = 8

/**
 * Sag lifecycle phases (consistent timing, perfect synchronization).
 * The 700ms total budget read as "darken and shake at the same
 * time" because the SAG→SHAKE delta (~200ms) sits below human
 * change-detection threshold. Three-phase state machine restores
 * legibility:
 *
 *   PRECARIOUS  ──── 36 ticks (~600ms) ──── slight darken
 *   SAGGING     ──── 36 ticks (~600ms) ──── heavy darken
 *   SHAKING     ──── 18 ticks (~300ms) ──── darken + jitter
 *   ──── release (fall) ────
 *
 * Total ~1.5s from detect to fall. Each phase is well above the
 * ~300ms change-detection threshold, so the player reads the tells
 * as distinct beats instead of one blur.
 */
export const SAG_PRECARIOUS_TICKS = 36
export const SAG_SAGGING_TICKS = 36
export const SAG_SHAKING_TICKS = 18
export const SAG_DURATION_TICKS =
  SAG_PRECARIOUS_TICKS + SAG_SAGGING_TICKS + SAG_SHAKING_TICKS

/** Maximum height of a falling chunk; taller unsupported chunks split. */
export const MAX_CHUNK_HEIGHT = 12

/** Mood drift coefficient per tick — `lerp(current, target, MOOD_LERP)`. */
export const MOOD_LERP = 0.05

/** Hysteresis: a new dominant mood axis must exceed the current by this. */
export const MOOD_SWITCH_THRESHOLD = 0.1

/** Sunk-cost commit window (ticks) — planner won't re-target until this elapses. */
export const PLAN_COMMIT_TICKS = 30

/** Cost (gems) of the Brace one-touch action. */
export const BRACE_COST = 1

/** Pet over-pet flaw — sliding window length and threshold count. */
export const OVER_PET_WINDOW_TICKS = 240
export const OVER_PET_THRESHOLD = 3

/**
 * Cantilever collapse — SOIL cells whose Manhattan-along-soil distance
 * to the nearest anchor (STONE / ROCK / fixture / world side+bottom
 * walls) exceeds this become unstable and sag. Higher = more forgiving
 * (fewer overhangs fall). At 10 a wall-to-wall tunnel of one row
 * leaves only the deepest center-of-overhang cells unstable, so
 * sagging happens but doesn't cascade across the whole chunk.
 */
export const MAX_REACH = 10

/**
 * Two-phase per-cell cadence — Mr. Driller-style drill THEN step:
 *
 *   1. DRILL phase: driller stops at the wall, plays the drill
 *      animation, and the target cell is converted to AIR after
 *      `DRILL_COOLDOWN_MS`. The sprite does NOT move during this
 *      phase — it's the "punch through the wall" beat.
 *   2. STEP phase: driller smoothly lerps across the now-cleared
 *      cell over `stepIntervalForDepth(row)` ms, snapping to grid on
 *      arrival.
 *
 * Walking through pre-existing AIR uses STEP only (no drill phase).
 * Falling under gravity also uses STEP cadence so the per-cell motion
 * speed is identical regardless of direction.
 *
 * Drill cadence is constant (a drill cycle is a drill cycle); step
 * cadence scales with depth so the driller feels increasingly frantic
 * the deeper they go.
 */
export const DRILL_COOLDOWN_MS = 180       // ~5.5 drills/sec, fixed
export const DIG_INTERVAL_MS_SHALLOW = 280 // ~3.6 cells/sec at start
export const DIG_INTERVAL_MS_DEEP = 130    // ~7.6 cells/sec near the core
export const DEPTH_AT_FULL_SPEED = 250     // depth row at which interval = DEEP

/** Extra cooldown when a gem is within this many cells (driller pauses to consider). */
export const PONDER_GEM_RADIUS = 3
export const PONDER_GEM_MS = 140

/**
 * Time per cell while a gem is falling under gravity (ms). Reliably
 * SLOWER than the driller's slowest step (`DIG_INTERVAL_MS_SHALLOW`),
 * so the driller — both walking and free-falling through the void
 * band — always overtakes gems. Mr. Driller's "you outrun the gems
 * during free fall" feel comes from this asymmetry: gems scroll
 * upward in the camera frame as the driller drops past them.
 */
export const FALL_INTERVAL_MS = 320

/** Multi-hit ROCK tile — number of dig actions to break. */
export const ROCK_HITS = 3

/** Explosive fuse — ticks from trigger to detonation (~0.5s @ 60Hz). */
export const EXPLOSIVE_FUSE_TICKS = 30

/** Explosion radius in cells (Chebyshev / king-move distance). 2 = 5×5 area. */
export const EXPLOSION_RADIUS = 2

/** Driller radius for explosive adjacency trigger (1 = 8-neighbor). */
export const EXPLOSIVE_TRIGGER_RADIUS = 1

/** Falling-rock hazard — telegraphed warning before drop. */
export const HAZARD_WARNING_TICKS = 60       // ~1.0s @ 60Hz
export const HAZARD_GRAVITY_PX = 0.8
export const HAZARD_TERMINAL_PX = 18

/** Spawn cadence — one hazard every N ticks (when conditions met). */
export const HAZARD_SPAWN_INTERVAL_TICKS = 600   // ~10s baseline
/** Hard floor on the per-spawn interval after biome scaling. */
export const HAZARD_SPAWN_INTERVAL_FLOOR = 360   // ~6s minimum
/** Per-biome multiplier (deeper biomes spawn more). Lower = less aggressive. */
export const HAZARD_DEPTH_BOOST = {
  topsoil: 0,
  'deep-dirt': 0.2,
  stoneworks: 0.4,
  'crystal-caverns': 0.6,
  core: 0.8,
} as const
/** Spawn skipped if a hazard already exists in this column. */
export const HAZARD_SPAWN_COL_RANGE = 3        // ±3 columns from driller
