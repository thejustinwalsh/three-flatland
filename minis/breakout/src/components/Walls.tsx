import type { Sprite2DMaterial } from 'three-flatland/react'
import { Layers } from 'three-flatland/react'
import {
  WORLD_LEFT,
  WORLD_RIGHT,
  WORLD_TOP,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '../systems/constants'

// Subtle border that frames the play area
const WALL_THICKNESS = 0.06

interface WallsRendererProps {
  wallMaterial: Sprite2DMaterial
}

export function WallsRenderer({ wallMaterial }: WallsRendererProps) {
  return (
    <>
      {/* Left wall */}
      <sprite2D
        material={wallMaterial}
        position={[WORLD_LEFT - WALL_THICKNESS / 2, 0, 0]}
        scale={[WALL_THICKNESS, WORLD_HEIGHT + WALL_THICKNESS, 1]}
        layer={Layers.GROUND}
        zIndex={1}
      />

      {/* Right wall */}
      <sprite2D
        material={wallMaterial}
        position={[WORLD_RIGHT + WALL_THICKNESS / 2, 0, 0]}
        scale={[WALL_THICKNESS, WORLD_HEIGHT + WALL_THICKNESS, 1]}
        layer={Layers.GROUND}
        zIndex={1}
      />

      {/* Top wall */}
      <sprite2D
        material={wallMaterial}
        position={[0, WORLD_TOP + WALL_THICKNESS / 2, 0]}
        scale={[WORLD_WIDTH + WALL_THICKNESS * 2, WALL_THICKNESS, 1]}
        layer={Layers.GROUND}
        zIndex={1}
      />
    </>
  )
}
