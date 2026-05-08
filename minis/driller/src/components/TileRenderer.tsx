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
  TILE_FIXTURE_BASE,
  TILE_ROCK,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import { MIN_PLAY_ROWS, PLAY_COLS, TILE_PX } from '../constants'
import { biomeAt } from '../biomes'

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
const TINT_ROCK = [0.55, 0.45, 0.35] as const // breakable rock — distinct from STONE
const TINT_EXPLOSIVE = [0.85, 0.20, 0.15] as const
const TINT_EXPLOSIVE_LIT = [1.0, 0.55, 0.20] as const // pulsing when triggered
const TINT_FIXTURE_BONE = [0.91, 0.90, 0.83] as const
const TINT_FIXTURE_MUSHROOM = [0.66, 0.55, 0.98] as const
const TINT_FIXTURE_CRYSTAL = [0.49, 0.23, 0.93] as const
// Sag flash: warm desaturated sand that pulses to a bright orange. The
// flash period (~280ms) is long enough to read clearly without feeling
// frantic at the surface; the SAG_DURATION_TICKS ≈ 0.7s gives the
// player ~3 pulses to react before the chunk falls.
const TINT_SAG_LO = [0.66, 0.48, 0.24] as const
const TINT_SAG_HI = [0.95, 0.62, 0.28] as const
const TINT_FALL = [0.85, 0.48, 0.24] as const
// Predictive "your next move makes this fall". Faster pulse, cooler
// hue so it reads distinctly from an active sag — this is "danger
// AHEAD", not "danger NOW".
const TINT_PRECARIOUS_LO = [0.55, 0.34, 0.20] as const
const TINT_PRECARIOUS_HI = [0.92, 0.40, 0.30] as const

function lerp3(a: readonly [number, number, number], b: readonly [number, number, number], t: number): readonly [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function pickTint(
  tile: number,
  frame: number,
  sagging: boolean,
  falling: boolean,
  precarious: boolean,
  triggeredExplosive: boolean,
  now: number,
  palette: { grass: readonly [number, number, number]; edge: readonly [number, number, number]; deep: readonly [number, number, number]; stone: readonly [number, number, number] },
): readonly [number, number, number] {
  if (falling) return TINT_FALL
  if (sagging) {
    // (sin*0.5 + 0.5) maps to 0..1 — smooth pulse, no hard flicker.
    const t = Math.sin((now / 280) * Math.PI * 2) * 0.5 + 0.5
    return lerp3(TINT_SAG_LO, TINT_SAG_HI, t)
  }
  if (precarious) {
    const t = Math.sin((now / 180) * Math.PI * 2) * 0.5 + 0.5
    return lerp3(TINT_PRECARIOUS_LO, TINT_PRECARIOUS_HI, t)
  }
  if (tile === TILE_SOIL) {
    if ((frame & 0x01) === 0) return palette.grass // top-exposed → grass cap
    if (frame === 0xf) return palette.deep
    return palette.edge
  }
  if (tile === TILE_STONE) return palette.stone
  if (tile === TILE_ROCK) return TINT_ROCK
  if (tile === TILE_EXPLOSIVE) return triggeredExplosive ? TINT_EXPLOSIVE_LIT : TINT_EXPLOSIVE
  if (tile >= TILE_FIXTURE_BASE && tile < TILE_FIXTURE_BASE + 8) {
    const v = tile - TILE_FIXTURE_BASE
    if (v === 0) return TINT_FIXTURE_BONE
    if (v === 1) return TINT_FIXTURE_MUSHROOM
    return TINT_FIXTURE_CRYSTAL
  }
  return palette.edge
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
    const { cols, rows, tiles, flags, frameIndex } = grid
    const pool = refs.current

    const topRow = Math.max(0, Math.floor(cam.y / TILE_PX) - 1)
    const bottomRow = Math.min(rows, topRow + cam.rows + 3)

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
        const sagging = (flags[idx]! & FLAG_SAGGING) !== 0
        const falling = (flags[idx]! & FLAG_FALLING) !== 0
        const precarious = (flags[idx]! & FLAG_PRECARIOUS) !== 0
        const shaking = (flags[idx]! & FLAG_SHAKING) !== 0
        const litExplosive = tile === TILE_EXPLOSIVE && triggeredExplosives.has(idx) && pulse
        const palette = biomeAt(r).palette
        const tint = pickTint(tile, frameIndex[idx]!, sagging, falling, precarious, litExplosive, now, palette)
        // Shake telegraph IS the lock-in moment right before fall —
        // not an extra delay layered on top. Cells get FLAG_SHAKING
        // only in the last few hundred ms of their commit window
        // (sag chunks: last ~300ms before release; avalanche rocks:
        // entire pre-fall telegraph). When you see shake, the block
        // is dropping next.
        let jitterX = 0
        let jitterY = 0
        if (shaking) {
          const phase = (now / 1000) * Math.PI * 2 * 30
          jitterX = Math.sin(phase) * 1.2
          jitterY = Math.cos(phase * 1.3) * 0.6
        }
        sprite.position.set(c * TILE_PX + TILE_PX / 2 + jitterX, -(r * TILE_PX + TILE_PX / 2) + jitterY, 0)
        sprite.scale.set(TILE_PX, TILE_PX, 1)
        sprite.tint.r = tint[0]
        sprite.tint.g = tint[1]
        sprite.tint.b = tint[2]
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
