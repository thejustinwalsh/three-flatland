/**
 * Compile-time constants. Values referenced from spec
 * `planning/superpowers/specs/2026-05-07-driller-mini-design.md`.
 */

/** Source tile size in pixels (1×). */
export const TILE_PX = 16

/** Fixed gameplay column count. The world is always 18 cells wide. */
export const PLAY_COLS = 18

/**
 * Fixed gameplay row count. 9:20 ratio with PLAY_COLS=18 — matches
 * modern mobile portrait (iPhone 15, Pixel 8 family). Logical
 * gameplay rect is 288×640 px at 1× scale; the compositor scales
 * this rect up by pixel-perfect integer steps that fit the viewport
 * height-first then width.
 *
 * Pre-refactor the playfield grew with the viewport; now it's a
 * fixed mobile-portrait shape regardless of host size, with the
 * remaining viewport filled by the blurred ambient bg layer.
 */
export const PLAY_ROWS = 40

/**
 * @deprecated kept for source-compat in callers that still read it.
 * New code should use PLAY_ROWS directly.
 */
export const MIN_PLAY_ROWS = PLAY_ROWS

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
 * Sag lifecycle phases.
 *
 *   PRECARIOUS  ──── 12 ticks (~200ms) ──── invisible (gradient leads)
 *   SAGGING     ──── 30 ticks (~500ms) ──── heavy darken
 *   SHAKING     ──── 30 ticks (~500ms) ──── darken + jitter
 *   ──── release (fall) ────
 *
 * Total ~1.0s from detect to fall.
 *
 * Why these values, under the diffusion model:
 *   - PRECARIOUS is now a brief commit beat (12t/~200ms). It's
 *     deliberately invisible — the cracking gradient is already
 *     showing weakness via `anchorDist` over the preceding
 *     wavefront-propagation ticks (each cell rises +1/tick toward
 *     INF). By the time PRECARIOUS fires, the player has already
 *     watched the affected region darken; we don't need another
 *     invisible beat. Was 54t (~900ms) — that was straight dead
 *     time and made the perceived delay-to-visible-warning feel
 *     sluggish.
 *   - SAGGING is the first visible state-darken (~500ms, > human
 *     change-detection threshold of ~300ms). "This WILL fall."
 *   - SHAKING (~500ms) is sized so a drill+step escape
 *     (180ms drill cooldown + 280ms shallow step = 460ms) can JUST
 *     complete before the chunk's first impact (~100ms after
 *     release). The narrow-escape beat — drop below 400ms and Mr.
 *     Driller's signature last-second-find-a-hole moment becomes
 *     physically impossible.
 *
 * The diffusion model now contributes additional pre-sag telegraph
 * via the cracking gradient (cells visibly darken over MANY ticks
 * as the wavefront approaches), so total perceived warning >> 1.0s
 * even though the sag-pipeline portion is shorter.
 */
export const SAG_PRECARIOUS_TICKS = 12
export const SAG_SAGGING_TICKS = 30
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

/** Gem cost per pet. */
export const PET_COST = 1
/** Driller pause duration per non-over-pet pet, in ticks (~1s @ 60Hz). */
export const PET_PAUSE_TICKS = 60
/**
 * Lifetime of the over-pet "angry shake" indicator, in ticks
 * (~0.33s @ 60Hz). The renderer oscillates the icon horizontally
 * over this window before the entity destroys itself.
 */
export const OVER_PET_SHAKE_TICKS = 20

/** Gem cost per cell-tick of paint (continuous, while button held). */
export const PAINT_COST_PER_TICK = 1
/**
 * How much each paint tick advances the painted cell's anchor distance
 * toward collapse. The relaxation pass naturally caps anchorDist at
 * 255; painting bumps it by this amount per tick, so a held click on
 * one cell reaches the sag threshold in a handful of ticks.
 */
export const PAINT_ANCHOR_BUMP = 16

/**
 * Gem time-pressure window. Once a gem's row is mutated (drill or
 * paint), `Gem.expireAtTick` is set to `gs.tick + GEM_FADE_TICKS` and
 * the renderer animates an ease-in grow + elastic-snap shrink+fade
 * across the window. At expireAtTick the gem destroys itself. The
 * void-band gem shower is exempt — those are always grabbable.
 *
 * ~3s @ 60Hz: enough time for the player to react and click, short
 * enough to genuinely apply pressure if many gems are exposed at once.
 */
export const GEM_FADE_TICKS = 180

/**
 * Cooldown between successive gem collects during gameplay (~0.2s @
 * 60Hz). Prevents auto-clicker farming under the new time-pressure
 * rules. Bypassed during free-fall (the void gem bonus zone is a
 * deliberate click-frenzy).
 */
export const GEM_COLLECT_COOLDOWN_TICKS = 12

/**
 * Floating "-N gem" popup lifetime in ticks (~600 ms @ 60Hz). The
 * renderer scales (pop), rises, and fades across this window.
 */
export const GEM_SPEND_POPUP_TTL_TICKS = 36
/**
 * Stack window: a second spend at the same cell within this many
 * ticks consolidates into the existing popup (amount += new). Without
 * stacking a held paint drag would spawn one popup per tick.
 */
export const GEM_SPEND_POPUP_STACK_WINDOW = 4

/** Hold-and-drag base cost per tick (~1s @ 60Hz → 1 gem). */
export const DRAG_COST_INTERVAL_TICKS = 60
export const DRAG_COST_PER_INTERVAL = 1
/**
 * Drag-cost scaling: each subsequent interval costs +N gems on top of
 * the base. After 5 seconds of holding, cost has ramped to 1+5=6/sec.
 */
export const DRAG_COST_SCALE_PER_INTERVAL = 1

/**
 * Cantilever collapse — SOIL cells whose Manhattan-along-soil distance
 * to the nearest anchor (STONE / ROCK / fixture / world side+bottom
 * walls) exceeds this become unstable and sag. Higher = more forgiving
 * (fewer overhangs fall). At 10 a wall-to-wall tunnel of one row
 * leaves only the deepest center-of-overhang cells unstable, so
 * sagging happens but doesn't cascade across the whole chunk.
 */
// MAX_REACH controls the cantilever distance threshold — SOIL cells
// whose 4-connected conductor-path to an anchor exceeds this become
// unstable. With the diffusion model:
//   - Anchor seeds: top edge + cell-above-fixture
//   - Conductors: SOIL + STONE (rocks are "really sturdy soil")
//   - FIXTUREs are walls; side walls and bottom edge are not seeds
// Bumped from 4 → 6 to compensate for the stricter anchor topology
// (fixtures emit only upward; sides/bottom no longer seed). Larger
// reach lets fixture-density rules in biomes.ts produce mostly-
// stable worlds with intentional cantilever overhangs.
export const MAX_REACH = 6

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

/**
 * Explosive fuse — ticks from trigger to detonation.
 *
 * Tuned for a 5×5 explosion radius (EXPLOSION_RADIUS=2). To survive,
 * the driller needs to move 3+ cells away in some direction. At 60Hz:
 *
 *   - Drilling SOIL costs DRILL_COOLDOWN_MS (180ms = 11 ticks) per cell.
 *   - Walking through AIR costs ~stepIntervalForDepth (varies, ~12-30
 *     ticks at depth, less in topsoil).
 *
 * Escaping 3 cells of mixed SOIL/AIR realistically takes 45-90 ticks
 * (~0.75-1.5s). The fuse is set to 105 ticks (~1.75s) so the player
 * has margin to plan a route AND execute it, without making bombs
 * trivially safe.
 *
 * Positional context (not tuned via this constant, but worth noting):
 *   - Bombs detonating ABOVE the driller leave AIR pockets that can
 *     funnel falling rocks/collapses onto him later — secondary
 *     hazard the player has to read.
 *   - Bombs detonating BELOW the driller create downward pressure;
 *     the safe direction is back the way he came (less progress).
 *
 * Bombs are a deep-biome mechanic, so the difficulty curve naturally
 * scales with the player having already navigated earlier biomes.
 */
export const EXPLOSIVE_FUSE_TICKS = 105

/** Explosion radius in cells (Chebyshev / king-move distance). 2 = 5×5 area. */
export const EXPLOSION_RADIUS = 2

/** Driller radius for explosive adjacency trigger (1 = 8-neighbor). */
export const EXPLOSIVE_TRIGGER_RADIUS = 1

/**
 * Falling-rock hazard — telegraphed warning before drop. Sized so
 * the AI driller has time to drill a 4-wide escape tunnel from under
 * a worst-case-incoming rock without dying. Drill cadence is
 * ~250ms/cell at typical depths, so 4 cells = ~1s; extra margin
 * means brace + reaction is feasible too.
 */
export const HAZARD_WARNING_TICKS = 90       // ~1.5s @ 60Hz
export const HAZARD_GRAVITY_PX = 0.8
export const HAZARD_TERMINAL_PX = 18

/**
 * Spawn cadence — global throttle between any two hazard spawns.
 * Tightened (was 600/360) so straight-down digging gets punished
 * fast enough that the AI can't out-run the rocks. With per-col
 * cooldown of 120t (~2s), a sustained shaft drops a rock every
 * ~3s in topsoil and faster in deeper biomes via depth boost.
 */
export const HAZARD_SPAWN_INTERVAL_TICKS = 300   // ~5s baseline
/** Hard floor on the per-spawn interval after biome scaling. */
export const HAZARD_SPAWN_INTERVAL_FLOOR = 180   // ~3s minimum
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
