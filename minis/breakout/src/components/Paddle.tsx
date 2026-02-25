import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery } from 'koota/react'
import type { Entity } from 'koota'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { Layers } from 'three-flatland/react'
import { Paddle as PaddleTrait, Position, Bounds } from '../traits'

interface PaddleRendererProps {
  material: Sprite2DMaterial
}

interface PaddleViewProps {
  entity: Entity
  material: Sprite2DMaterial
}

function PaddleView({ entity, material }: PaddleViewProps) {
  const spriteRef = useRef<Sprite2DType>(null)

  useFrame(() => {
    if (!entity.has(Position)) return

    const pos = entity.get(Position)!
    const bounds = entity.get(Bounds)!
    const sprite = spriteRef.current

    if (sprite) {
      sprite.position.set(pos.x, pos.y, 0)
      sprite.scale.set(bounds.width, bounds.height, 1)
    }
  })

  const pos = entity.get(Position)!
  const bounds = entity.get(Bounds)!

  return (
    <sprite2D
      ref={spriteRef}
      material={material}
      tint="#4ecdc4"
      position={[pos.x, pos.y, 0]}
      scale={[bounds.width, bounds.height, 1]}
      layer={Layers.ENTITIES}
      zIndex={15}
    />
  )
}

export function PaddleRenderer({ material }: PaddleRendererProps) {
  const paddles = useQuery(PaddleTrait, Position, Bounds)

  return (
    <>
      {paddles.map((entity) => (
        <PaddleView key={entity} entity={entity} material={material} />
      ))}
    </>
  )
}
