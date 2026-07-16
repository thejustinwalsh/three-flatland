import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery } from 'koota/react'
import type { Entity } from 'koota'
import {
  attachEffect,
  type Sprite2DMaterial,
  type Sprite2D as Sprite2DType,
} from 'three-flatland/react'
import { biomeAt } from '../biomes'
import {
  FallingChunk,
  TILE_EXPLOSIVE,
  TILE_FIXTURE_BASE,
  TILE_SOIL,
  TILE_STONE,
  isFixtureTile,
} from '../traits'
import { TILE_PX } from '../constants'
import { explosiveFrame, fixtureFrame, soilFrame, stoneFrame } from '../lib/world-tile-frames'
import { RENDER_LAYERS } from '../lib/render-layers'

interface Props {
  material: Sprite2DMaterial
}

const MAX_CELLS_PER_CHUNK = 96 // covers a full MAX_CHUNK_HEIGHT × PLAY_COLS slab

/**
 * Render the cells of an in-flight FallingChunk at the smoothly-
 * advancing (px, py) the collapse system writes each tick. Without
 * this, the chunk's grid cells are AIR while it falls (so TileRenderer
 * shows nothing), and the chunk only re-appears when it lands — a
 * teleport. With it, you watch the slab visibly drop.
 *
 * Each falling chunk maps to one mounted React component holding a
 * pool of MAX_CELLS_PER_CHUNK sprites; per-frame the visible cells
 * are positioned and tinted, the rest hidden by zero-scale.
 */
export function FallingChunkView({ material }: Props) {
  const chunks = useQuery(FallingChunk)
  return (
    <>
      {chunks.map((entity) => (
        <FallingChunkSprite key={entity} entity={entity} material={material} />
      ))}
    </>
  )
}

function FallingChunkSprite({ entity, material }: { entity: Entity; material: Sprite2DMaterial }) {
  const refs = useRef<(Sprite2DType | null)[]>([])
  if (refs.current.length !== MAX_CELLS_PER_CHUNK) {
    refs.current = new Array<Sprite2DType | null>(MAX_CELLS_PER_CHUNK).fill(null)
  }

  useFrame(() => {
    if (!entity.has(FallingChunk)) {
      for (const s of refs.current) if (s) s.scale.set(0, 0, 1)
      return
    }
    const fall = entity.get(FallingChunk)!
    const baseCellRow = Math.floor(fall.py / TILE_PX)
    const baseCellCol = Math.floor(fall.px / TILE_PX)
    const subY = fall.py - baseCellRow * TILE_PX
    const pool = refs.current

    let slot = 0
    for (const cell of fall.cells) {
      if (slot >= MAX_CELLS_PER_CHUNK) break
      const sprite = pool[slot++]
      if (!sprite) continue
      const cellCol = baseCellCol + cell.col
      const cellRow = baseCellRow + cell.row
      // World Y positive-down, Three Y up.
      const px = cellCol * TILE_PX + TILE_PX / 2
      const py = cellRow * TILE_PX + TILE_PX / 2 + subY
      sprite.position.set(px, -py, 0)
      sprite.scale.set(TILE_PX, TILE_PX, 1)
      // Tint to the tile's biome (using the fall.cells[i].row that was
      // captured at sag time, before the chunk released — biome
      // depends on the original world coords, not the current px/py).
      const biome = biomeAt(cell.row)
      const variant = Math.abs((cell.col * 7 + cell.row * 13) & 0xf)
      if (cell.tile === TILE_SOIL) sprite.setFrame(soilFrame(biome.name, variant))
      else if (cell.tile === TILE_STONE) sprite.setFrame(stoneFrame(biome.name, variant))
      else if (isFixtureTile(cell.tile))
        sprite.setFrame(fixtureFrame(cell.tile - TILE_FIXTURE_BASE, variant))
      else if (cell.tile === TILE_EXPLOSIVE) sprite.setFrame(explosiveFrame())
      sprite.tint.setRGB(0.85, 0.48, 0.24)
      sprite.castsShadow = cell.tile === TILE_STONE || isFixtureTile(cell.tile)
    }
    for (; slot < MAX_CELLS_PER_CHUNK; slot++) {
      const s = pool[slot]
      if (s) s.scale.set(0, 0, 1)
    }
  })

  const slots: number[] = []
  for (let i = 0; i < MAX_CELLS_PER_CHUNK; i++) slots.push(i)

  return (
    <>
      {slots.map((i) => (
        <sprite2D
          key={`falling-${i}`}
          ref={(el) => {
            refs.current[i] = el
          }}
          material={material}
          tint="#d97a3d"
          position={[0, 0, 0]}
          scale={[0, 0, 1]}
          frame={soilFrame('topsoil', 15)}
          sortLayer={RENDER_LAYERS.fallingTerrain}
        >
          <normalMapProvider attach={attachEffect} normalMap={null} />
        </sprite2D>
      ))}
    </>
  )
}
