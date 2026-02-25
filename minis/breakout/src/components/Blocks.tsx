import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery } from 'koota/react'
import type { Entity } from 'koota'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { Layers, attachEffect } from 'three-flatland/react'
import { Block as BlockTrait, Position, Bounds, BlockState, Dissolving } from '../traits'
import type { BlockDissolveEffect } from '../materials'

interface BlocksRendererProps {
  material: Sprite2DMaterial
}

type DissolveEffectInstance = InstanceType<typeof BlockDissolveEffect>

interface BlockViewProps {
  entity: Entity
  material: Sprite2DMaterial
}

function BlockView({ entity, material }: BlockViewProps) {
  const spriteRef = useRef<Sprite2DType>(null)
  const effectRef = useRef<DissolveEffectInstance>(null)

  useFrame(() => {
    if (!entity.has(Position)) return

    const pos = entity.get(Position)!
    const bounds = entity.get(Bounds)!
    const sprite = spriteRef.current

    if (sprite) {
      sprite.position.set(pos.x, pos.y, 0)
      sprite.scale.set(bounds.width * 0.95, bounds.height * 0.9, 1)

      const effect = effectRef.current
      if (entity.has(Dissolving)) {
        const progress = entity.get(Dissolving)!.progress
        if (effect) {
          effect.progress = progress
        }
      } else if (effect) {
        effect.progress = 0
      }
    }
  })

  const pos = entity.get(Position)!
  const bounds = entity.get(Bounds)!
  const blockState = entity.get(BlockState)!

  return (
    <sprite2D
      ref={spriteRef}
      material={material}
      tint={blockState.color}
      position={[pos.x, pos.y, 0]}
      scale={[bounds.width * 0.95, bounds.height * 0.9, 1]}
      layer={Layers.ENTITIES}
      zIndex={10}
    >
      <blockDissolveEffect
        attach={attachEffect}
        ref={effectRef}
      />
    </sprite2D>
  )
}

export function BlocksRenderer({ material }: BlocksRendererProps) {
  const blocks = useQuery(BlockTrait, Position, Bounds, BlockState)

  return (
    <>
      {blocks.map((entity) => (
        <BlockView key={entity} entity={entity} material={material} />
      ))}
    </>
  )
}
