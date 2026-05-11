import { useEffect, useMemo } from 'react'
import { Color, type Texture, Vector2 } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { Fn, color, mix, texture as textureNode, uv, vec2, vec3, vec4 } from 'three/tsl'
import { PLAY_COLS, PLAY_ROWS, TILE_PX } from '../constants'
import { pickScale } from '../lib/scale'

interface Props {
  gameTexture: Texture
  viewportSize: { width: number; height: number }
}

/**
 * Two in-canvas composite layers (with CSS gradient bg behind the
 * canvas providing layer 0):
 *
 *   layer 0 — biome-tinted CSS gradient (PlayCanvas host div)
 *   layer 1 — ambient blur+desat sample of game RT (fullscreen quad)
 *   layer 2 — solid biome bg + game RT passthrough (gameplay-rect
 *             quad, centered). The game's transparent AIR pixels
 *             reveal the solid biome color underneath — NOT the
 *             blurred bg behind, per the design.
 *
 * Future: layer 2's solid biome color becomes 3-4 parallax tile-art
 * layers each rendered as their own quad. The blurred ambient stays
 * as the deepest in-canvas scene texture.
 */
export function Compositor({ gameTexture, viewportSize }: Props) {
  const scale = pickScale(viewportSize.width, viewportSize.height)
  const rectW = PLAY_COLS * TILE_PX * scale
  const rectH = PLAY_ROWS * TILE_PX * scale

  // Uniform-ish: blur step in UV space. The game texture is 288×640
  // logical px; we want a blur kernel offset proportional to that.
  // 1/288 ≈ 0.0035 UV per logical px. A 2-3 px offset reads as light
  // DoF without dissolving the blockiness.
  const blurStep = useMemo(() => new Vector2(2 / (PLAY_COLS * TILE_PX), 2 / (PLAY_ROWS * TILE_PX)), [])

  // Ambient material — sample the game texture, apply a soft 5-tap
  // cross blur, desaturate ~25%, fade alpha to ~0.4 so the underlying
  // CSS gradient blends through.
  const ambientMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    const blurredColor = Fn(() => {
      const u = uv()
      const center = textureNode(gameTexture, u)
      const north = textureNode(gameTexture, u.add(vec2(0, blurStep.y)))
      const south = textureNode(gameTexture, u.sub(vec2(0, blurStep.y)))
      const east = textureNode(gameTexture, u.add(vec2(blurStep.x, 0)))
      const west = textureNode(gameTexture, u.sub(vec2(blurStep.x, 0)))
      const sum = center.add(north).add(south).add(east).add(west)
      const rgb = sum.rgb.mul(1 / 5)
      // Desaturate ~25%: mix toward luminance.
      const lum = rgb.dot(vec3(0.299, 0.587, 0.114))
      const desat = mix(rgb, vec3(lum, lum, lum), 0.25)
      return vec4(desat, 0.4) // mild alpha so CSS gradient shows
    })
    m.colorNode = blurredColor()
    m.transparent = true
    return m
  }, [gameTexture, blurStep])

  // Foreground material — straight texture sample, premultiplied
  // alpha handled by Flatland. Solid biome color underneath blocks
  // the ambient blur from showing through AIR pixels: we do this by
  // rendering a SECOND mesh behind the foreground at the same rect.
  const fgMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    m.colorNode = textureNode(gameTexture, uv())
    m.transparent = true
    return m
  }, [gameTexture])

  // Solid biome-tinted background just for the gameplay rect.
  // TODO(parallax): replace with 3-4 tile-art layers per biome.
  const biomeRectMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    m.colorNode = vec4(color(0x1a1411).toVec3(), 1) // topsoil-ish dark
    m.transparent = false
    return m
  }, [])

  // Match the foreground mesh's z order: ambient (back), biome
  // rect (middle), foreground (front). renderOrder is the explicit
  // override — z values stay 0 so they don't fight with R3F's
  // default frustum culling.
  return (
    <>
      <mesh material={ambientMaterial} renderOrder={0} position={[0, 0, 0]}>
        <planeGeometry args={[viewportSize.width, viewportSize.height]} />
      </mesh>
      <mesh material={biomeRectMaterial} renderOrder={1} position={[0, 0, 0]}>
        <planeGeometry args={[rectW, rectH]} />
      </mesh>
      <mesh material={fgMaterial} renderOrder={2} position={[0, 0, 0]}>
        <planeGeometry args={[rectW, rectH]} />
      </mesh>
    </>
  )
}

// Mark the Color import as used in TSL helpers (will be needed when
// biome rect goes biome-aware in a follow-up).
void Color
