import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery } from 'koota/react'
import type { Entity } from 'koota'
import {
  attachEffect,
  type Sprite2DMaterial,
  type Sprite2D as Sprite2DType,
} from 'three-flatland/react'
import { Hazard } from '../traits'
import { TILE_PX } from '../constants'
import { RENDER_LAYERS } from '../lib/render-layers'

interface Props {
  material: Sprite2DMaterial
}

interface ViewProps {
  entity: Entity
  material: Sprite2DMaterial
}

function HazardSprite({ entity, material }: ViewProps) {
  const spriteRef = useRef<Sprite2DType>(null)

  useFrame(() => {
    if (!entity.has(Hazard)) return
    const h = entity.get(Hazard)!
    const sprite = spriteRef.current
    if (!sprite) return
    sprite.position.set(h.col * TILE_PX + TILE_PX / 2, -h.py, 0)
    // Pulse during warning phase; solid during fall.
    if (h.phase === 'warning') {
      const pulse = Math.floor(Date.now() / 100) % 2 === 0
      sprite.tint.r = pulse ? 1 : 0.5
      sprite.tint.g = pulse ? 0.3 : 0.15
      sprite.tint.b = pulse ? 0.2 : 0.1
    } else {
      sprite.tint.r = 0.4
      sprite.tint.g = 0.4
      sprite.tint.b = 0.45
    }
    sprite.visible = h.phase !== 'landed'
  })

  const h = entity.get(Hazard)!
  return (
    <sprite2D
      ref={spriteRef}
      material={material}
      tint="#ff4d2a"
      position={[h.col * TILE_PX + TILE_PX / 2, -h.py, 0]}
      scale={[TILE_PX, TILE_PX, 1]}
      sortLayer={RENDER_LAYERS.fallingTerrain}
      castsShadow
    >
      <normalMapProvider attach={attachEffect} normalMap={null} />
    </sprite2D>
  )
}

export function HazardView({ material }: Props) {
  const hazards = useQuery(Hazard)
  return (
    <>
      {hazards.map((entity) => (
        <HazardSprite key={entity} entity={entity} material={material} />
      ))}
    </>
  )
}
