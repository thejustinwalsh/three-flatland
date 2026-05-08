import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery, useWorld } from 'koota/react'
import type { Entity } from 'koota'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { biomeAt } from '../biomes'
import { FallingChunk } from '../traits'
import { TILE_PX } from '../constants'

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
  const world = useWorld()
  const refs = useRef<(Sprite2DType | null)[]>([])
  if (refs.current.length !== MAX_CELLS_PER_CHUNK) {
    refs.current = new Array<Sprite2DType | null>(MAX_CELLS_PER_CHUNK).fill(null)
  }

  useEffect(() => {
    for (const s of refs.current) if (s) s.scale.set(0, 0, 1)
  }, [])

  useFrame(() => {
    if (!entity.has(FallingChunk)) {
      for (const s of refs.current) if (s) s.scale.set(0, 0, 1)
      return
    }
    const fall = entity.get(FallingChunk)!
    const baseCellRow = Math.floor(fall.py / TILE_PX)
    const baseCellCol = Math.floor(fall.px / TILE_PX)
    const subY = (fall.py - baseCellRow * TILE_PX)
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
      const tint = biome.palette.edge
      sprite.tint.r = tint[0]
      sprite.tint.g = tint[1]
      sprite.tint.b = tint[2]
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
          tint="#5a3a1a"
          position={[0, 0, 0]}
          scale={[0, 0, 1]}
        />
      ))}
    </>
  )
}
