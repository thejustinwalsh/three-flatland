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
  TILE_AIR,
  TILE_EXPLOSIVE,
  TILE_SOIL,
  TILE_STONE,
  isFixtureTile,
} from '../traits'
import { MIN_PLAY_ROWS, PLAY_COLS, TILE_PX } from '../constants'
import { biomeAt } from '../biomes'
import {
  ensureDebugRenderState,
  recordCellRender,
  tickDebugRenderFrame,
} from '../dev/render-instrument'

// Generous pool: covers tall viewports without stale-cell artifacts. The
// tile-iteration window is `cam.rows + 4` rows; pool must cover the
// largest plausible cam.rows for any viewport on a 1× scale step.
const POOL_ROWS = MIN_PLAY_ROWS + 24
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
const PRECARIOUS_DARKEN = 0.86
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
  palette: { grass: readonly [number, number, number]; edge: readonly [number, number, number]; deep: readonly [number, number, number]; stone: readonly [number, number, number] },
): readonly [number, number, number] {
  if (tile === TILE_SOIL) {
    if ((frame & 0x01) === 0) return palette.grass
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

function pickTint(
  tile: number,
  frame: number,
  hits: number,
  precarious: boolean,
  sagging: boolean,
  falling: boolean,
  triggeredExplosive: boolean,
  now: number,
  palette: { grass: readonly [number, number, number]; edge: readonly [number, number, number]; deep: readonly [number, number, number]; stone: readonly [number, number, number] },
): readonly [number, number, number] {
  void now
  if (falling) return TINT_FALL
  const base = pickBaseTint(tile, frame, hits, triggeredExplosive, palette)
  // SAGGING dominates PRECARIOUS — by the time the second phase
  // begins, the visual escalates. SHAKE shares the SAGGING tint and
  // adds jitter via the position offset elsewhere.
  if (sagging) {
    return [base[0] * SAG_DARKEN, base[1] * SAG_DARKEN, base[2] * SAG_DARKEN] as const
  }
  if (precarious) {
    return [base[0] * PRECARIOUS_DARKEN, base[1] * PRECARIOUS_DARKEN, base[2] * PRECARIOUS_DARKEN] as const
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

  // Initial: hide everything (zero-scale) until the first useFrame reads the grid.
  useEffect(() => {
    for (const s of refs.current) if (s) s.scale.set(0, 0, 1)
  }, [])

  useFrame(() => {
    const grid = world.get(Grid)
    const cam = world.get(Camera)
    if (!grid || !cam || grid.rows === 0) return
    const { cols, rows, tiles, flags, frameIndex, hits } = grid
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
    // Pulse: alternate the lit tint every 8 ticks for a flashing effect.
    const now = Date.now()
    const pulse = Math.floor(now / 80) % 2 === 0

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
        const precarious = (flags[idx]! & FLAG_PRECARIOUS) !== 0
        const sagging = (flags[idx]! & FLAG_SAGGING) !== 0
        const falling = (flags[idx]! & FLAG_FALLING) !== 0
        const shaking = (flags[idx]! & FLAG_SHAKING) !== 0
        const litExplosive = tile === TILE_EXPLOSIVE && triggeredExplosives.has(idx) && pulse
        const palette = biomeAt(r).palette
        const tint = pickTint(tile, frameIndex[idx]!, hits[idx] ?? 0, precarious, sagging, falling, litExplosive, now, palette)
        // Shake telegraph: deliberate "crack" rather than a buzz. A
        // few wide shudders at ~6 Hz (1 cycle ≈ 170 ms) so over the
        // ~300 ms window the player sees roughly two heavy lurches
        // before the fall actually animates. Larger amplitude gives
        // each pulse weight; both axes share the same phase so the
        // whole block lurches together (no electron-bouncing).
        let jitterX = 0
        let jitterY = 0
        if (shaking) {
          const phase = (now / 1000) * Math.PI * 2 * 6
          jitterX = Math.sin(phase) * 2.4
          jitterY = Math.sin(phase * 0.5) * 1.2
        }
        sprite.position.set(c * TILE_PX + TILE_PX / 2 + jitterX, -(r * TILE_PX + TILE_PX / 2) + jitterY, 0)
        sprite.scale.set(TILE_PX, TILE_PX, 1)
        sprite.tint.r = tint[0]
        sprite.tint.g = tint[1]
        sprite.tint.b = tint[2]
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
          tint="#6b4a2b"
          position={[0, 0, 0]}
          scale={[TILE_PX, TILE_PX, 1]}
        />
      ))}
    </>
  )
}
