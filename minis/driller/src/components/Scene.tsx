import { useMemo, useRef } from 'react'
import { extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Flatland, Sprite2D, Sprite2DMaterial, type Flatland as FlatlandType } from 'three-flatland/react'
import { useWorld } from 'koota/react'
import { Color } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import {
  Camera,
  FLAG_FALLING,
  FLAG_SAGGING,
  GameState,
  Grid,
  TILE_AIR,
  TILE_FIXTURE_BASE,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import { TILE_PX } from '../constants'
import { cameraSystem } from '../systems/camera'
import { autotilePass } from '../systems/autotile-pass'
import { TILE_COLORS, useDrillerMaterial } from '../materials'

extend({ Flatland, Sprite2D, Sprite2DMaterial })

/**
 * Pick the placeholder tint for a tile cell. Used until the atlas regions
 * are dialed in. Edge-vs-interior is implied by the autotile frame index
 * (0 = isolated, 15 = full interior); we lighten edges slightly so the
 * autotile resolver's output is visible at a glance.
 */
function tintFor(tile: number, frame: number, sagging: boolean, falling: boolean): string {
  if (sagging || falling) return TILE_COLORS.soilDeep
  if (tile === TILE_SOIL) {
    // Frame 15 = fully surrounded interior; lower bits = edge piece.
    if (frame === 0xf) return TILE_COLORS.soilDeep
    if (frame === 0) return TILE_COLORS.soilTop
    return TILE_COLORS.soilEdge
  }
  if (tile === TILE_STONE) return TILE_COLORS.stone
  if (tile >= TILE_FIXTURE_BASE && tile < TILE_FIXTURE_BASE + 8) {
    const v = tile - TILE_FIXTURE_BASE
    if (v === 0) return TILE_COLORS.fixtureBone
    if (v === 1) return TILE_COLORS.fixtureMushroom
    return TILE_COLORS.fixtureCrystal
  }
  return '#ff00ff' // hot-pink == bug indicator
}

/**
 * Renders the gameplay scene.
 *
 * - Owns the singleton Flatland renderer (sprite batching + camera).
 * - Drives the simulation tick (game logic) in the default 'update' phase.
 * - Composites in the 'render' phase via `flatland.render(gl)`, telling
 *   R3F to skip its own scene render.
 *
 * Phase 4: empty Flatland (no sprites yet); camera follow + tick increment
 * verified visually. Sprites land in Phase 5+.
 */
export function Scene() {
  const world = useWorld()
  const flatlandRef = useRef<FlatlandType>(null)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const material = useDrillerMaterial()
  const tickVersion = useRef(0)

  // Update phase: simulation logic
  useFrame(() => {
    if (!world.has(GameState)) return
    const gs = world.get(GameState)
    if (!gs) return
    gs.tick++

    cameraSystem(world)
    autotilePass(world)

    // Apply camera trait to Flatland's internal orthographic camera.
    const cam = world.get(Camera)
    const flatland = flatlandRef.current
    if (cam && flatland) {
      // World Y grows downward (cell rows); flip sign for Three's Y-up convention.
      flatland.camera.position.y = -cam.y
    }

    tickVersion.current++
  })

  // Render phase: composite. Skips R3F's default scene render.
  useFrame(() => {
    const flatland = flatlandRef.current
    if (!flatland) return
    flatland.resize(size.width, size.height)
    flatland.render(gl as unknown as WebGPURenderer)
  }, { phase: 'render' })

  // Visible cell window — recomputed each frame from camera trait.
  // Placeholder render: only generation-populated cells (non-AIR) emit sprites.
  // Will be replaced with imperative Sprite2D pool in a perf pass if needed.
  const cells = useVisibleTiles(world)

  const cam = world.get(Camera)
  const viewSize = (cam?.rows ?? 22) * TILE_PX

  return (
    <flatland
      ref={flatlandRef}
      viewSize={viewSize}
      clearColor={0x0a0a14}
      clearAlpha={0}
    >
      {cells.map((c) => (
        <sprite2D
          key={`${c.col},${c.row}`}
          material={material}
          position={[c.col * TILE_PX + TILE_PX / 2, -(c.row * TILE_PX + TILE_PX / 2), 0]}
          scale={[TILE_PX, TILE_PX, 1]}
          tint={c.color}
        />
      ))}
    </flatland>
  )
}

interface VisibleTile {
  col: number
  row: number
  color: Color
}

/**
 * Materialize the current visible cell window into VisibleTile entries.
 * Called inside render — keep cheap. Phase 5: simple O(visibleCells) sweep.
 */
function useVisibleTiles(world: ReturnType<typeof useWorld>): VisibleTile[] {
  return useMemo(() => {
    const grid = world.get(Grid)
    const cam = world.get(Camera)
    if (!grid || !cam || grid.rows === 0) return []
    const { cols, rows, tiles, flags, frameIndex } = grid

    const out: VisibleTile[] = []
    const topRow = Math.max(0, Math.floor(cam.y / TILE_PX) - 1)
    const bottomRow = Math.min(rows, topRow + cam.rows + 2)

    for (let r = topRow; r < bottomRow; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        const tile = tiles[idx] ?? TILE_AIR
        if (tile === TILE_AIR) continue
        const sagging = (flags[idx]! & FLAG_SAGGING) !== 0
        const falling = (flags[idx]! & FLAG_FALLING) !== 0
        const colorHex = tintFor(tile, frameIndex[idx]!, sagging, falling)
        out.push({ col: c, row: r, color: new Color(colorHex) })
      }
    }
    return out
    // Re-evaluate every frame; the tickVersion ref change forces recompute
    // (useMemo on tickVersion.current would be unsafe — rely on parent re-render).
    // For Phase 5's empty grid this is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.get(GameState)?.tick])
}
