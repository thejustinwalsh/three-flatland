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

/** Allowed integer pixel-scale steps (largest fitting one is chosen). */
export const SCALE_STEPS = [1, 2, 4, 8] as const

/** Vertical chunk height in rows. World streams in chunks of this size. */
export const CHUNK_ROWS = 32

/** Maximum number of chunks active in the simulation at once. */
export const ACTIVE_CHUNK_CAP = 8

/** Sag telegraph duration in 60Hz ticks (~0.7s). */
export const SAG_DURATION_TICKS = 42

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

/** Cantilever collapse — SOIL cells more than this many cells from any anchor sag. */
export const MAX_REACH = 5

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
export const HAZARD_SPAWN_INTERVAL_TICKS = 240   // ~4s baseline
/** Per-biome multiplier (deeper biomes spawn more). Index by biome name. */
export const HAZARD_DEPTH_BOOST = {
  topsoil: 0,
  'deep-dirt': 0.5,
  stoneworks: 1,
  'crystal-caverns': 1.2,
  core: 1.5,
} as const
/** Spawn skipped if a hazard already exists in this column. */
export const HAZARD_SPAWN_COL_RANGE = 3        // ±3 columns from driller
