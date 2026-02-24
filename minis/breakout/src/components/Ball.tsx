import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery, useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from '@three-flatland/react'
import { Layers, attachEffect } from '@three-flatland/react'
import { Ball as BallTrait, Position, Bounds, BallFlash } from '../traits'
import type { FlashEffect } from '../materials'

interface BallRendererProps {
  material: Sprite2DMaterial
}

type FlashEffectInstance = InstanceType<typeof FlashEffect>

export function BallRenderer({ material }: BallRendererProps) {
  const balls = useQuery(BallTrait, Position, Bounds)
  const world = useWorld()
  const spriteRefs = useRef<Map<number, Sprite2DType>>(new Map())
  const effectRefs = useRef<Map<number, FlashEffectInstance>>(new Map())

  useFrame(() => {
    for (const entity of world.query(BallTrait, Position, Bounds)) {
      const pos = entity.get(Position)!
      const bounds = entity.get(Bounds)!
      const sprite = spriteRefs.current.get(entity)

      if (sprite) {
        sprite.position.set(pos.x, pos.y, 0)
        sprite.scale.set(bounds.width, bounds.height, 1)

        // Update flash effect directly on effect ref
        const effect = effectRefs.current.get(entity)
        if (effect) {
          effect.amount = entity.has(BallFlash)
            ? entity.get(BallFlash)!.amount
            : 0
        }
      }
    }
  })

  return (
    <>
      {balls.map((entity) => {
        const pos = entity.get(Position)!
        const bounds = entity.get(Bounds)!

        return (
          <sprite2D
            key={entity}
            ref={(ref: Sprite2DType | null) => {
              if (ref) {
                spriteRefs.current.set(entity, ref)
              } else {
                spriteRefs.current.delete(entity)
              }
            }}
            material={material}
            tint="#ff6b9d"
            position={[pos.x, pos.y, 0]}
            scale={[bounds.width, bounds.height, 1]}
            layer={Layers.ENTITIES}
            zIndex={20}
          >
            <flashEffect
              attach={attachEffect}
              ref={(ref: FlashEffectInstance | null) => {
                if (ref) {
                  effectRefs.current.set(entity, ref)
                } else {
                  effectRefs.current.delete(entity)
                }
              }}
            />
          </sprite2D>
        )
      })}
    </>
  )
}
