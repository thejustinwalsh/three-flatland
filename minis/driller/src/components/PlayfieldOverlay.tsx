import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import type { Sprite2DMaterial, Sprite2D as Sprite2DType } from 'three-flatland/react'
import { Camera, Driller } from '../traits'
import { PLAY_COLS, PLAYFIELD_TOP_OFFSET_ROWS, TILE_PX } from '../constants'

interface Props {
  material: Sprite2DMaterial
}

/**
 * Darkening overlay for the "out of play" region above the logical
 * playfield top. Tall viewports show extra rows for nostalgic history,
 * but we don't want that exploited as hazard-dodging space — so the
 * region above (driller.row - PLAYFIELD_TOP_OFFSET_ROWS) gets a heavy
 * translucent wash.
 *
 * Implemented as a single Sprite2D scaled to the off-play band so it
 * sits inside the Flatland scene and always matches the play area.
 */
export function PlayfieldOverlay({ material }: Props) {
  const world = useWorld()
  const spriteRef = useRef<Sprite2DType>(null)

  useFrame(() => {
    const cam = world.get(Camera)
    const driller = world.queryFirst(Driller)
    const sprite = spriteRef.current
    if (!sprite || !cam || !driller) return
    const d = driller.get(Driller)!

    // Top of the LOGICAL playfield in world pixels (Y grows downward).
    const playfieldTopPy = (d.row - PLAYFIELD_TOP_OFFSET_ROWS) * TILE_PX
    // Top of what the camera is showing.
    const visibleTopPy = cam.y

    if (playfieldTopPy <= visibleTopPy) {
      // Nothing to darken — the playfield top is at or above the
      // camera's top edge.
      sprite.scale.set(0, 0, 1)
      return
    }

    const widthPx = PLAY_COLS * TILE_PX
    const heightPx = playfieldTopPy - visibleTopPy
    // Center of the dark band, in world coords. Three Y is up; world Y
    // is down — flip when placing.
    const centerWorldX = widthPx / 2
    const centerWorldY = visibleTopPy + heightPx / 2
    sprite.position.set(centerWorldX, -centerWorldY, 0)
    sprite.scale.set(widthPx, heightPx, 1)
    // Translucent dark wash — out-of-play history stays visible
    // through the overlay, just clearly de-emphasised.
    sprite.tint.r = 0.04
    sprite.tint.g = 0.03
    sprite.tint.b = 0.06
    sprite.alpha = 0.55
  })

  return (
    <sprite2D
      ref={spriteRef}
      material={material}
      tint="#070510"
      alpha={0.55}
      scale={[0, 0, 1]}
      position={[0, 0, 0]}
    />
  )
}
