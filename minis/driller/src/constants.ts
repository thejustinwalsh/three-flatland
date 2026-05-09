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
 * Downward reveal: tiles stream in `DOWNWARD_REVEAL_ROWS` rows ahead
 * of the driller via the chunk streamer in `generation.ts`. The top
 * of the playfield is the top of the camera viewport — there is no
 * fixed offset, since the PlayfieldOverlay was retired and the full
 * viewport is now playable.
 */

/** Allowed integer pixel-scale steps (largest fitting one is chosen). */
export const SCALE_STEPS = [1, 2, 4, 8] as const

/** Vertical chunk height in rows. World streams in chunks of this size. */
export const CHUNK_ROWS = 32

/** Maximum number of chunks active in the simulation at once. */
export const ACTIVE_CHUNK_CAP = 8

/**
 * Sag lifecycle phases (consistent timing, perfect synchronization).
 * Three-phase state machine — every phase well above human change-
 * detection threshold (~300ms) so the player reads the tells as
 * distinct beats instead of one blur:
 *
 *   PRECARIOUS  ──── 36 ticks (~600ms) ──── slight darken
 *   SAGGING     ──── 36 ticks (~600ms) ──── heavy darken
 *   SHAKING     ──── 24 ticks (~400ms) ──── darken + jitter
 *   ──── release (fall) ────
 *
 * Total ~1.6s from detect to fall. SHAKING is sized so a drill+step
 * (180ms drill cooldown + 280ms shallow step = 460ms) can JUST
 * complete before the chunk's first fall-cell impact (~100ms after
 * release): the player's sideways-into-the-hole escape lands at
 * t≈460ms while the falling chunk has only moved ~3px from its
 * release position. Drop SHAKING below 400ms and that "narrow
 * escape" becomes physically impossible — Mr. Driller's signature
 * last-second-find-a-hole moment relies on this margin.
 */
// Telegraph extended (was 36/36/24 = 1.6s) now that the always-on
// cracking gradient gives the player advance notice BEFORE a sag
// entity exists. Cells get visibly darker as their anchor distance
// grows, so by the time PRECARIOUS engages, the player already has
// a sense of where weakness is. The slower phase progression then
// builds anticipation without feeling sudden — total telegraph is
// now ~2.3s.
export const SAG_PRECARIOUS_TICKS = 54
export const SAG_SAGGING_TICKS = 54
export const SAG_SHAKING_TICKS = 30
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

/**
 * Brace extension applied when the player taps a SHAKING rock cluster
 * cell. Adds this many ticks to every cluster cell's `shakeStartTick`
 * so the elapsed-since-shake-start metric shrinks — buying the player
 * one extra full telegraph window before the cluster commits to fall.
 * In-motion (FLAG_FALLING) clusters cannot be braced (codex rule 5).
 */
export const ROCK_BRACE_EXTEND_TICKS = 30

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
// MAX_REACH controls the cantilever distance threshold — SOIL cells
// whose 4-connected SOIL-path to an anchor exceeds this become
// unstable. Smaller value = falls trigger easier = more interesting
// gameplay, more wall-shears. The cracking gradient renders 5
// discrete bands across [0..MAX_REACH], so 8 gives ~2-cell-per-band
// resolution.
export const MAX_REACH = 8

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
// Half the previous gem fall speed — gems drift down deliberately,
// giving the driller AI time to reach them and the player time to
// see them tumbling. Was 320ms; now 640ms per cell.
export const FALL_INTERVAL_MS = 640

/** Multi-hit ROCK tile — number of dig actions to break. */
/**
 * Hits-taken threshold at which a TILE_STONE breaks. Drilling adds 1
 * hit; an avalanche cluster cell crushing soil during its fall adds 1
 * hit. Fresh stones have 0 hits; worldgen "speed bump" stones spawn
 * pre-damaged at STONE_MAX_HITS - 1 so the driller can drill through
 * them in a single hit (the spiritual successor of the old TILE_ROCK).
 */
export const STONE_MAX_HITS = 4

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
