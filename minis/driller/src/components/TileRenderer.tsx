import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import {
  Camera,
  Explosive,
  FLAG_FALLING,
  FLAG_PRECARIOUS,
  FLAG_SAGGING,
  FLAG_SHAKING,
  Grid,
  Pointer,
  TILE_AIR,
  TILE_EXPLOSIVE,
  TILE_SOIL,
  TILE_STONE,
  isFixtureTile,
} from '../traits'
import { MAX_REACH, PLAY_COLS, PLAY_ROWS, TILE_PX } from '../constants'
import { biomeAt } from '../biomes'
import {
  ensureDebugRenderState,
  recordCellRender,
  tickDebugRenderFrame,
} from '../dev/render-instrument'
import { getRenderMode, heatmapTint } from '../dev/render-mode'
import { autotileMask } from '../lib/autotile'
import { CORNER_FRAME_INDEX, cornerMask, ROCK_FRAMES } from '../lib/rock-frames'
import { useRockAutotileMaterial } from '../materials'

// Fixed playfield + a small margin for the iteration window's
// cam.rows+3 lookahead. PLAY_ROWS is constant under the composition
// refactor (mobile-portrait shape regardless of host).
const POOL_ROWS = PLAY_ROWS + 8
const POOL_SIZE = PLAY_COLS * POOL_ROWS

/**
 * Static tints for non-soil tiles. SOIL / STONE colours come from the
 * current biome's palette (see `biomes.ts`) so the world visually
 * shifts as the driller descends.
 */
// Damaged stones (hits > 0) tint warmer/redder so the player can
// visually identify "drill me to escape" stones at a glance. This is
// the placeholder visual; the proper art pass introduces a 4-frame
// damage progression.
const TINT_DAMAGED_STONE = [0.55, 0.45, 0.35] as const
const TINT_EXPLOSIVE = [0.85, 0.20, 0.15] as const
const TINT_EXPLOSIVE_LIT = [1.0, 0.55, 0.20] as const // pulsing when triggered
// Unified placeholder amber — "honeycomb / safe haven" colour, distinct
// from biome palettes (browns/greens/purples), rocks (gray-tan), and
// explosives (red). All five fixture variants render with this tint
// until the proper art pass introduces per-variant sprites; the visual
// goal here is "this is mother nature's safe haven, no matter what
// kind of fixture it is".
const TINT_FIXTURE = [0.88, 0.74, 0.40] as const
// Sag lifecycle visual tiers. PRECARIOUS reads as "this is becoming
// unstable", SAG reads as "this WILL fall", and SHAKE adds rumble on
// top of the SAG tint. The constants are tuned so each tier is
// visually distinct at a glance — a SHAKE'ing block looks like a
// SAGGING block plus motion, not a separate colour.
// PRECARIOUS_DARKEN was a state-driven extra darken; it's been
// replaced by the always-on cracking gradient (`crackMultiplier`)
// which signals weakness BEFORE a sag entity is born. SAGGING still
// gets its own discrete darken on top of the gradient — the
// committed-fall signal — and SHAKE adds the position jitter.
const SAG_DARKEN = 0.72
const TINT_FALL = [0.85, 0.48, 0.24] as const

/**
 * Per-tile base tint — what the cell would look like normally, with
 * no transient state applied. The "darken on sag" effect is a true
 * multiplicative dim of THIS color, not a substitution with the
 * biome's edge tint, so a sagging grass-cap stays GREEN-but-dimmer
 * and a sagging deep-soil stays DARK-soil-but-dimmer.
 */
function pickBaseTint(
  tile: number,
  frame: number,
  hits: number,
  triggeredExplosive: boolean,
  northIsAir: boolean,
  palette: { grass: readonly [number, number, number]; edge: readonly [number, number, number]; deep: readonly [number, number, number]; stone: readonly [number, number, number] },
): readonly [number, number, number] {
  if (tile === TILE_SOIL) {
    // Grass-cap only when the cell directly above is AIR (open sky).
    // Without this check, soil cells beneath a STONE or FIXTURE would
    // render with the grass tint because their north autotile bit is
    // 0 (no soil above) — but they're not actually surface cells.
    if ((frame & 0x01) === 0 && northIsAir) return palette.grass
    if (frame === 0xf) return palette.deep
    return palette.edge
  }
  if (tile === TILE_STONE) {
    // Phase 2 unification: damaged stones (hits > 0) tint warmer so
    // the player can ID drillable speed-bumps and partly-cracked
    // stones at a glance.
    return hits > 0 ? TINT_DAMAGED_STONE : palette.stone
  }
  if (tile === TILE_EXPLOSIVE) return triggeredExplosive ? TINT_EXPLOSIVE_LIT : TINT_EXPLOSIVE
  if (isFixtureTile(tile)) return TINT_FIXTURE
  return palette.edge
}

/**
 * Convert a SOIL cell's anchor distance into a "cracking" multiplier.
 * The visual reads as cracking, so darker = more solid (deeper, more
 * pigment, less weathered) and lighter = more cracked / weathered /
 * about to fall. Five discrete bands across [0..MAX_REACH] give the
 * player a clear "I'm at level N of 5" signal instead of a smooth
 * gradient that's hard to count.
 *
 *   distance band      brightness     read
 *   ────────────────── ─────────────── ────────────────────────
 *   d == 0             0.65 (darkest)  anchor itself / very solid
 *   d in [1, 0.2*MAX]  0.75            solid
 *   d in [..., 0.4]    0.85            hairline cracks
 *   d in [..., 0.6]    0.92            visible cracks
 *   d in [..., 0.8]    0.97            heavily cracked
 *   d >= ~0.8 * MAX    1.00 (lightest) max cracking — about to fall
 *
 * Cells with d > MAX_REACH are usually in the sag pipeline and use
 * TINT_FALL once committed; if they're not in the pipeline yet
 * (within the same tick the gradient sees them) they render at the
 * brightest band.
 */
function crackMultiplier(distance: number, maxReach: number): number {
  if (distance < 0) return 1 // AIR / unreachable — caller handles
  if (distance === 0) return 0.7 // anchor / fully solid → darkest band
  if (distance >= maxReach) return 1.0 // about to fall → lightest band
  const t = distance / maxReach
  if (t < 0.2) return 0.78
  if (t < 0.4) return 0.85
  if (t < 0.6) return 0.91
  return 0.96
}

function pickTint(
  tile: number,
  frame: number,
  hits: number,
  distance: number,
  maxReach: number,
  precarious: boolean,
  sagging: boolean,
  falling: boolean,
  triggeredExplosive: boolean,
  northIsAir: boolean,
  now: number,
  palette: { grass: readonly [number, number, number]; edge: readonly [number, number, number]; deep: readonly [number, number, number]; stone: readonly [number, number, number] },
): readonly [number, number, number] {
  void now
  if (falling) return TINT_FALL
  const base = pickBaseTint(tile, frame, hits, triggeredExplosive, northIsAir, palette)
  // SAGGING is now an overlay on top of the cracking gradient — the
  // sag entity has committed, so we add an extra darken on top of
  // whatever cracking already showed. Player reads: "the cracked
  // area I was watching just committed."
  if (sagging) {
    return [base[0] * SAG_DARKEN, base[1] * SAG_DARKEN, base[2] * SAG_DARKEN] as const
  }
  // PRECARIOUS dropped: the cracking gradient already shows weakness
  // BEFORE the sag entity is born. PRECARIOUS used to be the "this
  // chunk just got a sag entity" state-darken; now that's redundant
  // with the gradient signal.
  void precarious
  // Cracking gradient — only applies to SOIL (other tile classes have
  // their own visual identity). Inverted from the original direction:
  // closer-to-anchor cells render DARKER (more pigment, more solid),
  // and far-from-anchor cells render at full brightness (visibly
  // weathered / cracked / about to fall). Five discrete bands so the
  // player can count the level instead of reading a smooth ramp.
  if (tile === TILE_SOIL && distance >= 0) {
    const m = crackMultiplier(distance, maxReach)
    if (m < 1) {
      return [base[0] * m, base[1] * m, base[2] * m] as const
    }
  }
  return base
}

interface TileRendererProps {
  material: Sprite2DMaterial
}

/**
 * Imperative tile sprite pool. Mounts POOL_SIZE sprites once; on every
 * frame walks the visible cell window and assigns each pool slot to a
 * (col, row) cell, mutating the Three sprite refs directly. No React
 * reconciliation per frame — the sprite count is fixed.
 *
 * Out-of-window pool slots are made invisible via `sprite.visible = false`.
 */
export function TileRenderer({ material }: TileRendererProps) {
  const world = useWorld()
  const refs = useRef<(Sprite2DType | null)[]>([])
  // Second pool for stones — uses the rock autotile atlas material so
  // each stone sprite picks a frame from `ROCK_FRAMES` based on its
  // 4-neighbor stone-mask. The autotile asset has 16 frames indexed
  // 0..15 by mask = N|S<<1|E<<2|W<<3 (matches the soil autotile).
  // Frame 15 is the stroke-free interior; frame 0 is the all-isolated
  // case with strokes on every edge.
  const rockRefs = useRef<(Sprite2DType | null)[]>([])
  // Corner-overlay pool — composites L-strokes onto stones whose
  // cardinal neighbors are present but a diagonal is missing. A
  // single stone can need up to 4 corner overlays (one per
  // direction); pool sized at POOL_SIZE comfortably covers even
  // dense interior-cluster scenarios since most cells consume 0.
  const cornerRefs = useRef<(Sprite2DType | null)[]>([])
  const rockMaterial = useRockAutotileMaterial()
  if (refs.current.length !== POOL_SIZE) {
    refs.current = new Array<Sprite2DType | null>(POOL_SIZE).fill(null)
  }
  if (rockRefs.current.length !== POOL_SIZE) {
    rockRefs.current = new Array<Sprite2DType | null>(POOL_SIZE).fill(null)
  }
  if (cornerRefs.current.length !== POOL_SIZE) {
    cornerRefs.current = new Array<Sprite2DType | null>(POOL_SIZE).fill(null)
  }

  // Initial: hide everything (zero-scale) until the first useFrame reads the grid.
  useEffect(() => {
    for (const s of refs.current) if (s) s.scale.set(0, 0, 1)
    for (const s of rockRefs.current) if (s) s.scale.set(0, 0, 1)
    for (const s of cornerRefs.current) if (s) s.scale.set(0, 0, 1)
  }, [])

  useFrame(() => {
    const grid = world.get(Grid)
    const cam = world.get(Camera)
    if (!grid || !cam || grid.rows === 0) return
    const { cols, rows, tiles, flags, frameIndex, hits, clusterId, anchorDist } = grid
    const pool = refs.current

    const topRow = Math.max(0, Math.floor(cam.y / TILE_PX) - 1)
    const bottomRow = Math.min(rows, topRow + cam.rows + 3)

    // Dev-only render-side instrumentation. `import.meta.env.DEV` is
    // `true` under vite dev (vitexec / pnpm dev:app); tsup builds
    // (consumed by docs / examples) replace it with `false` via
    // tsup.config.ts → esbuild dead-code-eliminates the entire branch
    // and `src/dev/render-instrument.ts` is tree-shaken out of dist.
    // Verified by grepping the built bundle for `__drillerRender`.
    const debugRender = import.meta.env.DEV
      ? ensureDebugRenderState(tiles.length)
      : undefined
    if (import.meta.env.DEV && debugRender) {
      tickDebugRenderFrame(debugRender, flags, topRow, bottomRow)
    }

    // Index triggered explosives by cell for fast tint lookup.
    const triggeredExplosives = new Set<number>()
    world.query(Explosive).forEach((entity) => {
      const e = entity.get(Explosive)
      if (e?.triggered) triggeredExplosives.add(e.row * cols + e.col)
    })
    // Cursor-coupled shake (wiggle gesture in progress): the cluster
    // the player is currently shaking gets jitter amplitude driven by
    // cursor velocity instead of the canned 6Hz sin loop. Velocity
    // decays each frame so the rock settles when the cursor stops.
    const ptr = world.get(Pointer)
    if (ptr && ptr.wiggleVelocity > 0) {
      world.set(Pointer, { wiggleVelocity: ptr.wiggleVelocity * 0.85 })
    }
    const wiggleClusterId = ptr?.wiggleClusterId ?? 0
    const wiggleAmp = ptr ? ptr.wiggleVelocity : 0
    // Pulse: alternate the lit tint every 8 ticks for a flashing effect.
    const now = Date.now()
    const pulse = Math.floor(now / 80) % 2 === 0

    // Always-on "weakness gradient" — tint SOIL by the persistent
    // anchor distance written by the diffusion model
    // (`relaxAnchorDist()` runs each tick from `collapseTick`). The
    // player sees a slow wavefront of cracking spread outward from
    // drilled cells over several frames — cause and effect is legible.
    //
    // ANCHOR_DIST_INF = 255 means "no anchor path"; the renderer
    // treats this the same as "max cracking" (about to fall).
    const heatmapMode = import.meta.env.DEV && getRenderMode() === 'anchor-heatmap'

    // Stone autotile lookup — cluster-id-aware so two adjacent-but-
    // independent clusters render with strokes between them (no
    // frankenglom). The factory closes over the seed cell's cluster
    // id; the returned isMatch returns true only for neighbors that
    // are stones AND in the same cluster.
    const makeIsSameCluster = (seedClusterId: number) => (cc: number, rr: number): boolean => {
      if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return false
      const idx = rr * cols + cc
      return tiles[idx] === TILE_STONE && (clusterId[idx] ?? 0) === seedClusterId
    }
    const rockPool = rockRefs.current
    const cornerPool = cornerRefs.current

    let slot = 0
    let rockSlot = 0
    let cornerSlot = 0
    for (let r = topRow; r < bottomRow && slot < POOL_SIZE && rockSlot < POOL_SIZE; r++) {
      for (let c = 0; c < cols && slot < POOL_SIZE && rockSlot < POOL_SIZE; c++) {
        const idx = r * cols + c
        const tile = tiles[idx] ?? TILE_AIR
        const sprite = pool[slot++]
        if (!sprite) continue
        if (tile === TILE_AIR) {
          // Hide via zero-scale: SpriteBatch's transformSyncSystem writes
          // the instance matrix from sprite.scale; Object3D.visible flag
          // is ignored at the per-instance level.
          sprite.scale.set(0, 0, 1)
          continue
        }
        const precarious = (flags[idx]! & FLAG_PRECARIOUS) !== 0
        const sagging = (flags[idx]! & FLAG_SAGGING) !== 0
        const falling = (flags[idx]! & FLAG_FALLING) !== 0
        const shaking = (flags[idx]! & FLAG_SHAKING) !== 0
        const litExplosive = tile === TILE_EXPLOSIVE && triggeredExplosives.has(idx) && pulse
        const palette = biomeAt(r).palette
        // Persistent anchor distance from the diffusion model. 255 = INF
        // (no anchor path); renderer treats >= MAX_REACH (or any value
        // beyond the gradient bands) as max cracking. Stones render
        // uniform — the gradient only paints SOIL.
        const rawDist = anchorDist[idx] ?? 255
        const distance = rawDist >= 255 ? -1 : rawDist
        // North-is-AIR test for grass-cap classification: SOIL with
        // STONE/FIXTURE above is NOT a grass cell — only SOIL with
        // open sky above is.
        const northIdx = r > 0 ? (r - 1) * cols + c : -1
        const northIsAir = northIdx === -1 || (tiles[northIdx] ?? TILE_AIR) === TILE_AIR
        let tint: readonly [number, number, number]
        if (heatmapMode) {
          const ht = heatmapTint(distance, MAX_REACH)
          tint =
            ht !== null
              ? ht
              : pickTint(tile, frameIndex[idx]!, hits[idx] ?? 0, distance, MAX_REACH, precarious, sagging, falling, litExplosive, northIsAir, now, palette)
        } else {
          tint = pickTint(tile, frameIndex[idx]!, hits[idx] ?? 0, distance, MAX_REACH, precarious, sagging, falling, litExplosive, northIsAir, now, palette)
        }
        // Shake telegraph. Two sources:
        //   1. Avalanche-induced (collapse pre-fall): canned 6Hz sin
        //      wobble at constant amplitude. Communicates the rock
        //      is about to drop on its own.
        //   2. Player wiggle-shake (this cluster matches the active
        //      wiggleClusterId): amplitude scales by wiggleVelocity
        //      so the rock literally follows the cursor's recent
        //      motion. Still cursor = still rock; fast wiggle = big
        //      wobble. Feels instant, not canned.
        let jitterX = 0
        let jitterY = 0
        if (shaking) {
          const isPlayerWiggled =
            wiggleClusterId !== 0 && tile === TILE_STONE && (clusterId[idx] ?? 0) === wiggleClusterId
          if (isPlayerWiggled) {
            // Higher-frequency, lower-amplitude per cycle — scaled by
            // cursor velocity. MAX_AMP=3px at full velocity.
            const phase = (now / 1000) * Math.PI * 2 * 14
            const amp = wiggleAmp * 3
            jitterX = Math.sin(phase) * amp
            jitterY = Math.sin(phase * 0.7) * amp
          } else {
            const phase = (now / 1000) * Math.PI * 2 * 6
            jitterX = Math.sin(phase) * 1.0
            jitterY = Math.sin(phase * 0.5) * 1.0
          }
        }
        const posX = c * TILE_PX + TILE_PX / 2 + jitterX
        const posY = -(r * TILE_PX + TILE_PX / 2) + jitterY
        if (tile === TILE_STONE) {
          // Route to the rock-autotile pool; hide the regular slot so
          // we don't double-paint with the flat color underneath. The
          // slot was already consumed by `slot++` above.
          sprite.scale.set(0, 0, 1)
          const seedCluster = clusterId[idx] ?? 0
          const isMatch = makeIsSameCluster(seedCluster)
          const rockSprite = rockPool[rockSlot++]
          if (rockSprite) {
            const mask = autotileMask(c, r, isMatch) & 0xf
            const frame = ROCK_FRAMES[mask]!
            rockSprite.setFrame(frame)
            rockSprite.position.set(posX, posY, 0)
            rockSprite.scale.set(TILE_PX, TILE_PX, 1)
            rockSprite.tint.r = tint[0]
            rockSprite.tint.g = tint[1]
            rockSprite.tint.b = tint[2]
          }
          // Corner overlays — for each missing-diagonal-but-cardinals-
          // present corner, composite a small L-stroke on top of the
          // base rock. Most stones contribute 0 corners; interior /
          // T / L joints can need up to 4. Pool capacity is POOL_SIZE
          // — far more than worst-case visible inner-corners.
          const corners = cornerMask(c, r, isMatch)
          if (corners !== 0) {
            for (let bit = 0; bit < 4 && cornerSlot < POOL_SIZE; bit++) {
              if ((corners & (1 << bit)) === 0) continue
              const cs = cornerPool[cornerSlot++]
              if (!cs) continue
              cs.setFrame(ROCK_FRAMES[CORNER_FRAME_INDEX[bit]!]!)
              cs.position.set(posX, posY, 0)
              cs.scale.set(TILE_PX, TILE_PX, 1)
              // Tint corners the same as the body — strokes already
              // baked into the alpha-only L glyph; multiplying by the
              // body tint keeps them in the same color family.
              cs.tint.r = tint[0]
              cs.tint.g = tint[1]
              cs.tint.b = tint[2]
            }
          }
        } else {
          sprite.position.set(posX, posY, 0)
          sprite.scale.set(TILE_PX, TILE_PX, 1)
          sprite.tint.r = tint[0]
          sprite.tint.g = tint[1]
          sprite.tint.b = tint[2]
        }
        if (import.meta.env.DEV && debugRender) {
          recordCellRender(debugRender, idx, shaking, jitterX !== 0 || jitterY !== 0)
        }
      }
    }
    // Hide leftover slots that didn't get assigned a cell this frame.
    for (; slot < POOL_SIZE; slot++) {
      const s = pool[slot]
      if (s) s.scale.set(0, 0, 1)
    }
    for (; rockSlot < POOL_SIZE; rockSlot++) {
      const s = rockPool[rockSlot]
      if (s) s.scale.set(0, 0, 1)
    }
    for (; cornerSlot < POOL_SIZE; cornerSlot++) {
      const s = cornerPool[cornerSlot]
      if (s) s.scale.set(0, 0, 1)
    }
  })

  const slots = useMemo(() => Array.from({ length: POOL_SIZE }, (_, i) => i), [])

  return (
    <>
      {slots.map((i) => (
        <sprite2D
          key={`tile-${i}`}
          ref={(el) => {
            refs.current[i] = el
          }}
          material={material}
          tint="#6b4a2b"
          position={[0, 0, 0]}
          scale={[TILE_PX, TILE_PX, 1]}
        />
      ))}
      {slots.map((i) => (
        <sprite2D
          key={`rock-${i}`}
          ref={(el) => {
            rockRefs.current[i] = el
          }}
          material={rockMaterial}
          tint="#71717a"
          position={[0, 0, 0]}
          scale={[0, 0, 1]}
          frame={ROCK_FRAMES[15]}
        />
      ))}
      {slots.map((i) => (
        <sprite2D
          key={`corner-${i}`}
          ref={(el) => {
            cornerRefs.current[i] = el
          }}
          material={rockMaterial}
          tint="#71717a"
          position={[0, 0, 0]}
          scale={[0, 0, 1]}
          frame={ROCK_FRAMES[16]}
        />
      ))}
    </>
  )
}
