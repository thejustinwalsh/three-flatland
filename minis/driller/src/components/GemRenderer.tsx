import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useQuery, useWorld } from 'koota/react'
import type { Entity } from 'koota'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { Driller, Gem } from '../traits'
import { PLAYFIELD_TOP_OFFSET_ROWS, TILE_PX } from '../constants'
import { GEM_DEATH_ROWS } from '../systems/gem-gravity'

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
  const world = useWorld()
  const spriteRef = useRef<Sprite2DType>(null)
  const sizeRef = useRef(8)

  useFrame(() => {
    if (!entity.has(Gem)) return
    const g = entity.get(Gem)!
    const sprite = spriteRef.current
    if (!sprite) return
    if (g.collected) {
      sprite.visible = false
      return
    }
    // Smoothly-lerped px/py from the gem-gravity system.
    sprite.position.set(g.px, -g.py, 0)
    sprite.visible = true

    // Death tween: when a gem crosses ABOVE the playfield top (into
    // the dark history overlay) it has GEM_DEATH_ROWS rows of life
    // left while we play a fun anticipation-then-collapse scale-out.
    // 0..0.25 of the window: tiny pop up to 1.2× as the gem "reacts"
    // to leaving the play area. 0.25..1.0: cubic ease-out collapse to
    // zero. Alpha follows a complementary curve so the colour fades
    // alongside the size.
    const driller = world.queryFirst(Driller)
    let scale = 1
    let alpha = 1
    if (driller) {
      const d = driller.get(Driller)!
      const playfieldTop = d.row - PLAYFIELD_TOP_OFFSET_ROWS
      const rowsAbove = playfieldTop - g.row
      if (rowsAbove > 0) {
        const t = Math.min(1, rowsAbove / GEM_DEATH_ROWS)
        if (t < 0.25) {
          // anticipation pop
          scale = 1 + (t / 0.25) * 0.2
          alpha = 1
        } else {
          // collapse — 1 - cubic
          const u = (t - 0.25) / 0.75
          scale = (1 - u * u * u) * 1.2
          alpha = 1 - u
        }
      }
    }
    const baseSize = sizeRef.current
    sprite.scale.set(baseSize * scale, baseSize * scale, 1)
    sprite.alpha = alpha
  })

  const g = entity.get(Gem)!
  const tintHex = GEM_HEX[g.color] ?? '#a78bfa'
  const size = GEM_SIZE_PX[g.size] ?? 8
  sizeRef.current = size

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
