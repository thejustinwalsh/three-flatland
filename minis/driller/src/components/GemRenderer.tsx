import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery } from 'koota/react'
import type { Entity } from 'koota'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { Gem } from '../traits'
import { TILE_PX } from '../constants'

const GEM_HEX = {
  emerald: '#34d399',
  topaz: '#fcd34d',
  ruby: '#f43f5e',
  amethyst: '#a78bfa',
} as const

const GEM_SIZE_PX = {
  small: 6,
  medium: 8,
  large: 10,
  huge: 12,
} as const

interface GemRendererProps {
  material: Sprite2DMaterial
}

interface ViewProps {
  entity: Entity
  material: Sprite2DMaterial
}

function GemSprite({ entity, material }: ViewProps) {
  const spriteRef = useRef<Sprite2DType>(null)

  useFrame(() => {
    if (!entity.has(Gem)) return
    const g = entity.get(Gem)!
    const sprite = spriteRef.current
    if (!sprite) return
    if (g.collected) {
      sprite.visible = false
      return
    }
    // Always read the smoothly-lerped px/py from the gem-gravity
    // system. Both at-rest gems (prev === row) and falling gems use the
    // same fields; scattered gems also write px/py via their own scatter
    // tween. World Y is positive-down — flip sign for Three's Y-up.
    sprite.position.set(g.px, -g.py, 0)
    sprite.visible = true
  })

  const g = entity.get(Gem)!
  const tintHex = GEM_HEX[g.color] ?? '#a78bfa'
  const size = GEM_SIZE_PX[g.size] ?? 8

  return (
    <sprite2D
      ref={spriteRef}
      material={material}
      tint={tintHex}
      position={[g.px || g.col * TILE_PX + TILE_PX / 2, -(g.py || g.row * TILE_PX + TILE_PX / 2), 0]}
      scale={[size, size, 1]}
    />
  )
}

export function GemRenderer({ material }: GemRendererProps) {
  const gems = useQuery(Gem)
  return (
    <>
      {gems.map((entity) => (
        <GemSprite key={entity} entity={entity} material={material} />
      ))}
    </>
  )
}
