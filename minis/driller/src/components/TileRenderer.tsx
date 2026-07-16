import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import {
  attachEffect,
  type Sprite2DMaterial,
  type Sprite2D as Sprite2DType,
} from 'three-flatland/react'
import {
  Camera,
  Explosive,
  FLAG_FALLING,
  FLAG_SAGGING,
  FLAG_SHAKING,
  Grid,
  TILE_AIR,
  TILE_EXPLOSIVE,
  TILE_FIXTURE_BASE,
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
import {
  explosiveFrame,
  fixtureFrame,
  soilFrame,
  stoneFrame,
  tileFrameFlipsX,
} from '../lib/world-tile-frames'
import { RENDER_LAYERS } from '../lib/render-layers'

// Fixed playfield + a small margin for the iteration window's
// cam.rows+3 lookahead. PLAY_ROWS is constant under the composition
// refactor (mobile-portrait shape regardless of host).
const POOL_ROWS = PLAY_ROWS + 8
const POOL_SIZE = PLAY_COLS * POOL_ROWS

const TINT_DAMAGED_STONE = [1.0, 0.72, 0.52] as const
const TINT_EXPLOSIVE = [0.85, 0.2, 0.15] as const
const TINT_EXPLOSIVE_LIT = [1.0, 0.55, 0.2] as const // pulsing when triggered
const SAG_DARKEN = 0.72
const TINT_FALL = [0.85, 0.48, 0.24] as const

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
  hits: number,
  distance: number,
  maxReach: number,
  sagging: boolean,
  falling: boolean,
  triggeredExplosive: boolean
): readonly [number, number, number] {
  if (falling) return TINT_FALL
  let base: readonly [number, number, number] = [1, 1, 1]
  if (tile === TILE_STONE && hits > 0) base = TINT_DAMAGED_STONE
  if (tile === TILE_EXPLOSIVE) base = triggeredExplosive ? TINT_EXPLOSIVE_LIT : TINT_EXPLOSIVE
  if (sagging) {
    return [base[0] * SAG_DARKEN, base[1] * SAG_DARKEN, base[2] * SAG_DARKEN] as const
  }
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
  if (refs.current.length !== POOL_SIZE) {
    refs.current = new Array<Sprite2DType | null>(POOL_SIZE).fill(null)
  }

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
    const debugRender = import.meta.env.DEV ? ensureDebugRenderState(tiles.length) : undefined
    if (import.meta.env.DEV && debugRender) {
      tickDebugRenderFrame(debugRender, flags, topRow, bottomRow)
    }

    // Index triggered explosives by cell for fast tint lookup.
    const triggeredExplosives = new Set<number>()
    world.query(Explosive).forEach((entity) => {
      const e = entity.get(Explosive)
      if (e?.triggered) triggeredExplosives.add(e.row * cols + e.col)
    })
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
    const makeIsSameCluster =
      (seedClusterId: number) =>
      (cc: number, rr: number): boolean => {
        if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return false
        const idx = rr * cols + cc
        return tiles[idx] === TILE_STONE && (clusterId[idx] ?? 0) === seedClusterId
      }
    let slot = 0
    for (let r = topRow; r < bottomRow && slot < POOL_SIZE; r++) {
      for (let c = 0; c < cols && slot < POOL_SIZE; c++) {
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
        const sagging = (flags[idx]! & FLAG_SAGGING) !== 0
        const falling = (flags[idx]! & FLAG_FALLING) !== 0
        const shaking = (flags[idx]! & FLAG_SHAKING) !== 0
        const litExplosive = tile === TILE_EXPLOSIVE && triggeredExplosives.has(idx) && pulse
        const biome = biomeAt(r)
        // Persistent anchor distance from the diffusion model. 255 = INF
        // (no anchor path); renderer treats >= MAX_REACH (or any value
        // beyond the gradient bands) as max cracking. Stones render
        // uniform — the gradient only paints SOIL.
        const rawDist = anchorDist[idx] ?? 255
        const distance = rawDist >= 255 ? -1 : rawDist
        let tint: readonly [number, number, number]
        if (heatmapMode) {
          const ht = heatmapTint(distance, MAX_REACH)
          tint =
            ht !== null
              ? ht
              : pickTint(tile, hits[idx] ?? 0, distance, MAX_REACH, sagging, falling, litExplosive)
        } else {
          tint = pickTint(tile, hits[idx] ?? 0, distance, MAX_REACH, sagging, falling, litExplosive)
        }
        // Shake telegraph: canned 6Hz wobble during the avalanche
        // pre-fall window. Communicates "this is about to drop".
        let jitterX = 0
        let jitterY = 0
        if (shaking) {
          const phase = (now / 1000) * Math.PI * 2 * 6
          jitterX = Math.sin(phase) * 1.0
          jitterY = Math.sin(phase * 0.5) * 1.0
        }
        const posX = c * TILE_PX + TILE_PX / 2 + jitterX
        const posY = -(r * TILE_PX + TILE_PX / 2) + jitterY
        if (tile === TILE_SOIL) {
          const mask = frameIndex[idx] ?? 15
          sprite.setFrame(soilFrame(biome.name, mask))
          sprite.flipX = tileFrameFlipsX(mask)
        } else if (tile === TILE_STONE) {
          const seedCluster = clusterId[idx] ?? 0
          const isMatch = makeIsSameCluster(seedCluster)
          const mask = autotileMask(c, r, isMatch)
          sprite.setFrame(stoneFrame(biome.name, mask))
          sprite.flipX = tileFrameFlipsX(mask)
        } else if (isFixtureTile(tile)) {
          sprite.setFrame(fixtureFrame(tile - TILE_FIXTURE_BASE, c * 3 + r * 5))
          sprite.flipX = ((c + r) & 1) === 1
        } else if (tile === TILE_EXPLOSIVE) {
          sprite.setFrame(explosiveFrame())
          sprite.flipX = false
        }
        sprite.position.set(posX, posY, 0)
        sprite.scale.set(TILE_PX, TILE_PX, 1)
        sprite.tint.r = tint[0]
        sprite.tint.g = tint[1]
        sprite.tint.b = tint[2]
        // Only anchored stone/fixtures occlude the helmet light. Making
        // every diggable soil cell a caster turns a packed cave into one
        // continuous SDF wall and erases the playable pool of light.
        sprite.castsShadow = tile === TILE_STONE || isFixtureTile(tile)
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
          tint="#ffffff"
          position={[0, 0, 0]}
          scale={[0, 0, 1]}
          frame={soilFrame('topsoil', 15)}
          sortLayer={RENDER_LAYERS.terrain}
        >
          <normalMapProvider attach={attachEffect} normalMap={null} />
        </sprite2D>
      ))}
    </>
  )
}
