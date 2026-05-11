import { useMemo } from 'react'
import { type Texture } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { Fn, color, mix, texture as textureNode, uv, vec2, vec3, vec4 } from 'three/tsl'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
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

  // Ambient bg: fit WIDTH, clip height, bias bottom to viewport.
  // Maintains the gameplay rect's 9:20 aspect when scaled up — no
  // stretching. Width = viewport width; height = viewport width *
  // (PLAY_ROWS / PLAY_COLS). Position so the BOTTOM of the ambient
  // bg aligns with the bottom of the viewport (top can overflow
  // upward, off-screen). In the orthographic scene the viewport
  // bottom is at y = -viewportSize.height/2.
  const bgAspect = PLAY_ROWS / PLAY_COLS // 40/18 ≈ 2.22
  const bgW = viewportSize.width
  const bgH = bgW * bgAspect
  const bgY = -viewportSize.height / 2 + bgH / 2 // bottom-aligned



  // Ambient material — built-in three.js separable two-pass gaussian
  // blur applied to the game RT. Sigma controls kernel width; the
  // node manages its own intermediate render target internally so
  // we get a real high-quality gaussian without writing a multi-tap
  // kernel ourselves.
  // V-flip the UV so plane bottom (= viewport bottom) maps to the
  // bottom of the rendered scene, aligning the bg with the
  // foreground orientation.
  const ambientMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    // Sample the game texture with flipped V, then blur the resulting
    // node. directionNode = null lets the node compute an isotropic
    // blur (two-pass separable internally). sigma=4 gives a clearly
    // blurred read without obliterating the world's structural color.
    const flippedTex = textureNode(gameTexture, vec2(uv().x, uv().y.oneMinus()))
    const blurred = gaussianBlur(flippedTex, null, 4)
    const composed = Fn(() => {
      const rgb = blurred.rgb
      const lum = rgb.dot(vec3(0.299, 0.587, 0.114))
      const desat = mix(rgb, vec3(lum, lum, lum), 0.25)
      return vec4(desat, 0.22)
    })
    m.colorNode = composed()
    m.transparent = true
    return m
  }, [gameTexture])

  // Foreground material — V-flipped sample of the game RT. Texture
  // alpha is preserved so AIR cells are transparent; the opaque
  // biome rect immediately behind provides the solid color the user
  // sees through them.
  const fgMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    m.colorNode = textureNode(gameTexture, vec2(uv().x, uv().y.oneMinus()))
    m.transparent = true
    return m
  }, [gameTexture])

  // Solid biome-colored quad at the gameplay rect. OPAQUE. Sits
  // immediately behind the foreground via explicit z (z=-0.01)
  // so depth ordering is enforced regardless of how the renderer
  // sorts transparent objects.
  // TODO(parallax): replace with 3-4 tile-art layers per biome.
  const biomeRectMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    m.colorNode = vec4(color(0x1a1411).toVec3(), 1)
    m.transparent = false
    return m
  }, [])

  // Z ordering: ambient (z=-1, far back, transparent), biome rect
  // (z=-0.01, opaque, immediately behind foreground), foreground
  // (z=0, transparent). The biome rect writes depth which guarantees
  // the ambient doesn't bleed through the gameplay area.
  return (
    <>
      <mesh material={ambientMaterial} position={[0, bgY, -1]}>
        <planeGeometry args={[bgW, bgH]} />
      </mesh>
      <mesh material={biomeRectMaterial} position={[0, 0, -0.01]}>
        <planeGeometry args={[rectW, rectH]} />
      </mesh>
      <mesh material={fgMaterial} position={[0, 0, 0]}>
        <planeGeometry args={[rectW, rectH]} />
      </mesh>
    </>
  )
}
