/**
 * Normal source descriptor — the shared shape used across three
 * surfaces:
 *
 *   1. Library API   `bakeNormalMap(pixels, w, h, descriptor)`
 *   2. CLI           `flatland-bake normal --descriptor <file>`
 *   3. Loader API    `LDtkLoader.load(url, { normals: descriptor })`
 *
 * The descriptor carries enough information for the baker to emit a
 * 1:1 co-registered normal map: where the regions live, how each
 * region tilts, and what per-texel bump source to use.
 *
 * All types are pure and browser-safe — consumed identically by node
 * bakers and browser runtime loaders.
 */

// ─── Direction ────────────────────────────────────────────────────────────

/**
 * Screen-relative direction the surface normal's XY component points.
 *
 * Mental model: imagine the baked normal as an arrow. `NormalDirection`
 * is the screen-space direction that arrow tilts toward — equivalently,
 * the direction the tile's visible face is "pointing." For a wall at
 * the top of the map (visible face toward the camera below), that's
 * `'south'` / `'down'`.
 *
 * Cardinal and compass aliases are equivalent; the canonical form in
 * the codebase is NSEW. Numbers are interpreted as radians in standard
 * math convention (0 = +X / right, CCW positive).
 */
export type NormalDirection =
  | 'flat'
  | 'up'
  | 'north'
  | 'down'
  | 'south'
  | 'left'
  | 'west'
  | 'right'
  | 'east'
  | 'up-left'
  | 'north-west'
  | 'up-right'
  | 'north-east'
  | 'down-left'
  | 'south-west'
  | 'down-right'
  | 'south-east'
  | number

/**
 * Resolve a `NormalDirection` to an angle in radians, or `null` when
 * the direction is `'flat'` (no tilt).
 *
 * Convention: 0 = +X / right, π/2 = +Y / up, π = -X / left,
 * -π/2 = -Y / down. Matches `Math.atan2` output.
 */
export function directionToAngle(
  direction: NormalDirection | undefined
): number | null {
  if (direction === undefined || direction === 'flat') return null
  if (typeof direction === 'number') return direction

  switch (direction) {
    case 'right':
    case 'east':
      return 0
    case 'up':
    case 'north':
      return Math.PI / 2
    case 'left':
    case 'west':
      return Math.PI
    case 'down':
    case 'south':
      return -Math.PI / 2
    case 'up-right':
    case 'north-east':
      return Math.PI / 4
    case 'up-left':
    case 'north-west':
      return (3 * Math.PI) / 4
    case 'down-right':
    case 'south-east':
      return -Math.PI / 4
    case 'down-left':
    case 'south-west':
      return (-3 * Math.PI) / 4
  }
  throw new Error(`unknown NormalDirection: ${String(direction)}`)
}

// ─── Bump ─────────────────────────────────────────────────────────────────

/**
 * Per-texel bump source inside a region. Each non-'none' mode runs a
 * central-difference gradient on the named channel; the result is
 * treated as a height field where high values are raised and low
 * values are sunken. Negative `strength` inverts (dark = raised).
 *
 * - `'alpha'` — gradient on the source alpha channel (default).
 *   Preserves sprite silhouette edges — the classic path for
 *   transparent sprites. Solid opaque regions produce no bump.
 * - `'luminance'` — gradient on Rec. 709 luminance `(0.2126·R +
 *   0.7152·G + 0.0722·B)`. Brick faces read as raised; dark mortar
 *   lines read as sunken grooves. Right mode for solid opaque
 *   tilesets.
 * - `'red'` / `'green'` / `'blue'` — gradient on a single color
 *   channel. Use when your art treats one channel as a height map
 *   (e.g., packing height into the red channel of a data texture).
 * - `'none'` — flat fill at the region's tilt direction. No per-texel
 *   variation; cheapest and useful for uniform surfaces.
 */
export type NormalBump =
  | 'alpha'
  | 'luminance'
  | 'red'
  | 'green'
  | 'blue'
  | 'none'

// ─── Regions + descriptor ─────────────────────────────────────────────────

export interface NormalRegion {
  x: number
  y: number
  w: number
  h: number
  /** Per-texel bump source. Default inherits from descriptor (`'alpha'`). */
  bump?: NormalBump
  /** Base tilt direction. Default inherits from descriptor (`'flat'`). */
  direction?: NormalDirection
  /**
   * Tilt angle in radians from flat. Ignored when `direction === 'flat'`.
   * Default inherits from descriptor, which defaults to `Math.PI / 4`.
   */
  pitch?: number
  /** Gradient strength multiplier for this region. Default 1. */
  strength?: number
  /**
   * World-space elevation of the region in [0, 1], where 0 = ground
   * plane (floor) and 1 = top-of-wall (cap). Baked into the normal
   * atlas's B channel and consumed by the light pass to compute
   * per-fragment light direction (`L.z = lightHeight − elevation`).
   *
   * Default inherits from the descriptor, which defaults to 0. Cap
   * regions typically set 1; tilted face regions typically set 0.5.
   */
  elevation?: number
}

export interface NormalSourceDescriptor {
  /** Reserved for future schema evolution. Currently always `1`. */
  version?: 1
  /** Default bump source for regions that don't specify one. Default `'alpha'`. */
  bump?: NormalBump
  /** Default tilt for regions that don't specify one. Default `'flat'`. */
  direction?: NormalDirection
  /** Default tilt pitch in radians. Default `Math.PI / 4`. */
  pitch?: number
  /** Default gradient strength. Default `1`. */
  strength?: number
  /** Default elevation for regions that don't specify one. Default 0 (ground). */
  elevation?: number
  /**
   * Regions of the source texture. When omitted, the whole texture is
   * treated as a single region inheriting all descriptor defaults.
   */
  regions?: NormalRegion[]
}

// ─── Defaults ─────────────────────────────────────────────────────────────

export const DEFAULT_PITCH = Math.PI / 4
export const DEFAULT_STRENGTH = 1
export const DEFAULT_BUMP: NormalBump = 'alpha'
export const DEFAULT_ELEVATION = 0

/**
 * Merge a region against its parent descriptor defaults. Returns a
 * fully-populated region suitable for direct consumption by the baker.
 */
export interface ResolvedNormalRegion {
  x: number
  y: number
  w: number
  h: number
  bump: NormalBump
  /** Tilt angle in radians, or `null` when the region is flat. */
  angle: number | null
  pitch: number
  strength: number
  /** World-space elevation in [0, 1]. Written to the output B channel. */
  elevation: number
}

export function resolveRegion(
  region: NormalRegion,
  descriptor: NormalSourceDescriptor = {}
): ResolvedNormalRegion {
  const direction = region.direction ?? descriptor.direction ?? 'flat'
  const angle = directionToAngle(direction)
  const elevation =
    region.elevation ?? descriptor.elevation ?? DEFAULT_ELEVATION
  return {
    x: region.x,
    y: region.y,
    w: region.w,
    h: region.h,
    bump: region.bump ?? descriptor.bump ?? DEFAULT_BUMP,
    angle,
    pitch: region.pitch ?? descriptor.pitch ?? DEFAULT_PITCH,
    strength: region.strength ?? descriptor.strength ?? DEFAULT_STRENGTH,
    // Clamp to [0, 1] so stored B channel can't overflow.
    elevation: Math.max(0, Math.min(1, elevation)),
  }
}
