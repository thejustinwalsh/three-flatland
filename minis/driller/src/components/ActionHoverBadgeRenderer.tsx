import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2D as Sprite2DType, Sprite2DMaterial } from 'three-flatland/react'
import { TILE_PX } from '../constants'
import { actionIconFrame, type ActionIconName } from '../lib/action-icon-frames'
import { RENDER_LAYERS } from '../lib/render-layers'
import { Pointer } from '../traits'

interface Props {
  material: Sprite2DMaterial
}

const HOVER_ACTION_ICON: Partial<Record<string, ActionIconName>> = {
  brace: 'add-support',
  drag: 'shield',
  paint: 'drop-rocks',
}

/** Authored Help / Sabotage badge previewed above the current world target. */
export function ActionHoverBadgeRenderer({ material }: Props) {
  const world = useWorld()
  const ref = useRef<Sprite2DType>(null)

  useFrame(() => {
    const sprite = ref.current
    const pointer = world.get(Pointer)
    if (!sprite || !pointer || pointer.active) {
      if (sprite) sprite.scale.set(0, 0, 1)
      return
    }
    const iconName = HOVER_ACTION_ICON[pointer.hoverAction]
    if (!iconName) {
      sprite.scale.set(0, 0, 1)
      return
    }
    sprite.setFrame(actionIconFrame(iconName))
    sprite.position.set(
      pointer.hoverTargetCol * TILE_PX + TILE_PX / 2,
      -(pointer.hoverTargetRow * TILE_PX) + 3,
      0
    )
    sprite.scale.set(14, 14, 1)
    sprite.alpha = 1
  })

  return (
    <sprite2D
      ref={ref}
      material={material}
      tint="#ffffff"
      position={[0, 0, 0]}
      scale={[0, 0, 1]}
      frame={actionIconFrame('add-support')}
      sortLayer={RENDER_LAYERS.ui}
      lit={false}
    />
  )
}
