import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery } from 'koota/react'
import type { Entity } from 'koota'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from '@three-flatland/react'
import { Layers, attachEffect } from '@three-flatland/react'
import { Ball as BallTrait, Position, Bounds, BallFlash } from '../traits'
import type { FlashEffect } from '../materials'

interface BallRendererProps {
  material: Sprite2DMaterial
}

type FlashEffectInstance = InstanceType<typeof FlashEffect>

interface BallViewProps {
  entity: Entity
  material: Sprite2DMaterial
}

function BallView({ entity, material }: BallViewProps) {
  const spriteRef = useRef<Sprite2DType>(null)
  const effectRef = useRef<FlashEffectInstance>(null)

  useFrame(() => {
    if (!entity.has(Position)) return

    const pos = entity.get(Position)!
    const bounds = entity.get(Bounds)!
    const sprite = spriteRef.current

    if (sprite) {
      sprite.position.set(pos.x, pos.y, 0)
      sprite.scale.set(bounds.width, bounds.height, 1)

      const effect = effectRef.current
      if (effect) {
        effect.amount = entity.has(BallFlash)
          ? entity.get(BallFlash)!.amount
          : 0
      }
    }
  })

  const pos = entity.get(Position)!
  const bounds = entity.get(Bounds)!

  return (
    <sprite2D
      ref={spriteRef}
      material={material}
      tint="#ff6b9d"
      position={[pos.x, pos.y, 0]}
      scale={[bounds.width, bounds.height, 1]}
      layer={Layers.ENTITIES}
      zIndex={20}
    >
      <flashEffect
        attach={attachEffect}
        ref={effectRef}
      />
    </sprite2D>
  )
}

export function BallRenderer({ material }: BallRendererProps) {
  const balls = useQuery(BallTrait, Position, Bounds)

  return (
    <>
      {balls.map((entity) => (
        <BallView key={entity} entity={entity} material={material} />
      ))}
    </>
  )
}
