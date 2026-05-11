import { useMemo } from 'react'
import { type Texture } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { texture as textureNode, uv } from 'three/tsl'
import { PLAY_COLS, PLAY_ROWS, TILE_PX } from '../constants'
import { pickScale } from '../lib/scale'

interface Props {
  gameTexture: Texture
  viewportSize: { width: number; height: number }
}

/**
 * Two-pass composite that surrounds the gameplay rect:
 *
 *   layer 0 — biome-tinted gradient bg (placeholder; future parallax)
 *   layer 1 — ambient blur+desat sample of the game RT, fullscreen
 *   layer 2 — pixel-perfect game RT, centered, integer-scale
 *
 * Coordinate system: R3F default camera here is an orthographic
 * camera looking at z=0. We size and position quads in canvas pixels
 * so the compositor logic mirrors the host viewport directly.
 *
 * NOTE: this initial implementation is layer 2 only (passthrough).
 * Layers 0 + 1 (gradient bg, blurred ambient) land in the next
 * iteration once the RT pipeline is verified working.
 */
export function Compositor({ gameTexture, viewportSize }: Props) {
  const scale = pickScale(viewportSize.width, viewportSize.height)
  const rectW = PLAY_COLS * TILE_PX * scale
  const rectH = PLAY_ROWS * TILE_PX * scale

  // Foreground material — straight texture sample, no shader effects.
  // Recreate on texture change (rare; happens on RT reallocation).
  const fgMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    m.colorNode = textureNode(gameTexture, uv())
    m.transparent = true
    return m
  }, [gameTexture])

  return (
    <>
      {/* Layer 2: pixel-perfect game, centered. Z=0 in screen space.
          Positioned in pixel coords (R3F orthographic camera default
          is centered at origin; we offset by half-size to center). */}
      <mesh material={fgMaterial} position={[0, 0, 0]}>
        <planeGeometry args={[rectW, rectH]} />
      </mesh>
    </>
  )
}
