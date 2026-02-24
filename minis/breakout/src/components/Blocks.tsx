import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery, useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from '@three-flatland/react'
import { Layers, attachEffect } from '@three-flatland/react'
import { Block as BlockTrait, Position, Bounds, BlockState, Dissolving } from '../traits'
import type { BlockDissolveEffect } from '../materials'

interface BlocksRendererProps {
  material: Sprite2DMaterial
}

type DissolveEffectInstance = InstanceType<typeof BlockDissolveEffect>

export function BlocksRenderer({ material }: BlocksRendererProps) {
  const blocks = useQuery(BlockTrait, Position, Bounds, BlockState)
  const world = useWorld()
  const spriteRefs = useRef<Map<number, Sprite2DType>>(new Map())
  const effectRefs = useRef<Map<number, DissolveEffectInstance>>(new Map())

  // Update sprite positions and effects every frame
  useFrame(() => {
    for (const entity of world.query(BlockTrait, Position, Bounds, BlockState)) {
      const pos = entity.get(Position)!
      const bounds = entity.get(Bounds)!
      const sprite = spriteRefs.current.get(entity)

      if (sprite) {
        sprite.position.set(pos.x, pos.y, 0)
        sprite.scale.set(bounds.width * 0.95, bounds.height * 0.9, 1)

        // Update dissolve progress directly on effect ref
        const effect = effectRefs.current.get(entity)
        if (entity.has(Dissolving)) {
          const progress = entity.get(Dissolving)!.progress
          if (effect) {
            effect.progress = progress
          }
        } else if (effect) {
          effect.progress = 0
        }
      }
    }
  })

  return (
    <>
      {blocks.map((entity) => {
        const pos = entity.get(Position)!
        const bounds = entity.get(Bounds)!
        const blockState = entity.get(BlockState)!

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
            tint={blockState.color}
            position={[pos.x, pos.y, 0]}
            scale={[bounds.width * 0.95, bounds.height * 0.9, 1]}
            layer={Layers.ENTITIES}
            zIndex={10}
          >
            <blockDissolveEffect
              attach={attachEffect}
              ref={(ref: DissolveEffectInstance | null) => {
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
