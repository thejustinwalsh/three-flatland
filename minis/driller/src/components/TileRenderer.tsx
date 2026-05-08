import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import {
  Camera,
  Explosive,
  FLAG_FALLING,
  FLAG_SAGGING,
  Grid,
  TILE_AIR,
  TILE_EXPLOSIVE,
  TILE_FIXTURE_BASE,
  TILE_ROCK,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import { MIN_PLAY_ROWS, PLAY_COLS, TILE_PX } from '../constants'

// Generous pool: covers tall viewports without stale-cell artifacts. The
// tile-iteration window is `cam.rows + 4` rows; pool must cover the
// largest plausible cam.rows for any viewport on a 1× scale step.
const POOL_ROWS = MIN_PLAY_ROWS + 24
const POOL_SIZE = PLAY_COLS * POOL_ROWS

/**
 * Tile tints stored as packed [r, g, b] floats (0..1) so we can update a
 * Sprite2D's tint without allocating a Color object each frame.
 */
const TINT_SOIL_DEEP = [0.36, 0.25, 0.14] as const
const TINT_SOIL_EDGE = [0.42, 0.29, 0.17] as const
const TINT_GRASS = [0.37, 0.66, 0.28] as const
const TINT_STONE = [0.44, 0.44, 0.48] as const
const TINT_ROCK = [0.55, 0.45, 0.35] as const // distinct from stone — warmer, breakable
const TINT_EXPLOSIVE = [0.85, 0.20, 0.15] as const
const TINT_EXPLOSIVE_LIT = [1.0, 0.55, 0.20] as const // pulsing when triggered
const TINT_FIXTURE_BONE = [0.91, 0.90, 0.83] as const
const TINT_FIXTURE_MUSHROOM = [0.66, 0.55, 0.98] as const
const TINT_FIXTURE_CRYSTAL = [0.49, 0.23, 0.93] as const
const TINT_SAG = [0.66, 0.48, 0.24] as const
const TINT_FALL = [0.85, 0.48, 0.24] as const

function pickTint(tile: number, frame: number, sagging: boolean, falling: boolean, triggeredExplosive: boolean): readonly [number, number, number] {
  if (falling) return TINT_FALL
  if (sagging) return TINT_SAG
  if (tile === TILE_SOIL) {
    if ((frame & 0x01) === 0) return TINT_GRASS // top-exposed → grass cap
    if (frame === 0xf) return TINT_SOIL_DEEP
    return TINT_SOIL_EDGE
  }
  if (tile === TILE_STONE) return TINT_STONE
  if (tile === TILE_ROCK) return TINT_ROCK
  if (tile === TILE_EXPLOSIVE) return triggeredExplosive ? TINT_EXPLOSIVE_LIT : TINT_EXPLOSIVE
  if (tile >= TILE_FIXTURE_BASE && tile < TILE_FIXTURE_BASE + 8) {
    const v = tile - TILE_FIXTURE_BASE
    if (v === 0) return TINT_FIXTURE_BONE
    if (v === 1) return TINT_FIXTURE_MUSHROOM
    return TINT_FIXTURE_CRYSTAL
  }
  return TINT_SOIL_EDGE
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

  // Initial: hide everything until the first useFrame reads the grid.
  useEffect(() => {
    for (const s of refs.current) if (s) s.visible = false
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
    const pulse = Math.floor(Date.now() / 80) % 2 === 0

    let slot = 0
    for (let r = topRow; r < bottomRow && slot < POOL_SIZE; r++) {
      for (let c = 0; c < cols && slot < POOL_SIZE; c++) {
        const idx = r * cols + c
        const tile = tiles[idx] ?? TILE_AIR
        const sprite = pool[slot++]
        if (!sprite) continue
        if (tile === TILE_AIR) {
          sprite.visible = false
          continue
        }
        const sagging = (flags[idx]! & FLAG_SAGGING) !== 0
        const falling = (flags[idx]! & FLAG_FALLING) !== 0
        const litExplosive = tile === TILE_EXPLOSIVE && triggeredExplosives.has(idx) && pulse
        const tint = pickTint(tile, frameIndex[idx]!, sagging, falling, litExplosive)
        sprite.visible = true
        sprite.position.set(c * TILE_PX + TILE_PX / 2, -(r * TILE_PX + TILE_PX / 2), 0)
        sprite.scale.set(TILE_PX, TILE_PX, 1)
        sprite.tint.r = tint[0]
        sprite.tint.g = tint[1]
        sprite.tint.b = tint[2]
      }
    }
    // Hide any leftover slots
    for (; slot < POOL_SIZE; slot++) {
      const s = pool[slot]
      if (s) s.visible = false
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
