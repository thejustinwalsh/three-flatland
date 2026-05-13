import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery } from 'koota/react'
import type { Entity } from 'koota'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { Driller } from '../traits'
import { TILE_PX } from '../constants'

interface DrillerViewProps {
  material: Sprite2DMaterial
}

interface ViewProps {
  entity: Entity
  material: Sprite2DMaterial
}

function DrillerSprite({ entity, material }: ViewProps) {
  const spriteRef = useRef<Sprite2DType>(null)

  useFrame(() => {
    if (!entity.has(Driller)) return
    const d = entity.get(Driller)!
    const sprite = spriteRef.current
    if (!sprite) return
    // Read the smoothly-interpolated pixel position written by the
    // driller system, NOT the snapped (col,row). World Y is
    // positive-down; Three is Y-up — flip sign.
    sprite.position.set(d.px, -d.py, 0)
  })

  const d = entity.get(Driller)!
  return (
    <sprite2D
      ref={spriteRef}
      material={material}
      tint="#fcd34d"
      position={[d.px, -d.py, 0]}
      scale={[12, 12, 1]}
    />
  )
}

export function DrillerView({ material }: DrillerViewProps) {
  const drillers = useQuery(Driller)
  return (
    <>
      {drillers.map((entity) => (
        <DrillerSprite key={entity} entity={entity} material={material} />
      ))}
    </>
  )
}
