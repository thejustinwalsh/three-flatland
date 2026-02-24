import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery, useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from '@three-flatland/react'
import { Layers } from '@three-flatland/react'
import { Paddle as PaddleTrait, Position, Bounds } from '../traits'

interface PaddleRendererProps {
  material: Sprite2DMaterial
}

export function PaddleRenderer({ material }: PaddleRendererProps) {
  const paddles = useQuery(PaddleTrait, Position, Bounds)
  const world = useWorld()
  const spriteRefs = useRef<Map<number, Sprite2DType>>(new Map())

  useFrame(() => {
    for (const entity of world.query(PaddleTrait, Position, Bounds)) {
      const pos = entity.get(Position)!
      const bounds = entity.get(Bounds)!
      const sprite = spriteRefs.current.get(entity)

      if (sprite) {
        sprite.position.set(pos.x, pos.y, 0)
        sprite.scale.set(bounds.width, bounds.height, 1)
      }
    }
  })

  return (
    <>
      {paddles.map((entity) => {
        const pos = entity.get(Position)!
        const bounds = entity.get(Bounds)!

        return (
          <sprite2D
            key={entity}
            ref={(ref: Sprite2DType | null) => {
              if (ref) spriteRefs.current.set(entity, ref)
              else spriteRefs.current.delete(entity)
            }}
            material={material}
            tint="#4ecdc4"
            position={[pos.x, pos.y, 0]}
            scale={[bounds.width, bounds.height, 1]}
            layer={Layers.ENTITIES}
            zIndex={15}
          />
        )
      })}
    </>
  )
}
