import { useMemo } from 'react'
import { type Texture, Vector2 } from 'three'
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

  // Blur kernel offset in UV space. Larger = blurrier bg. Tuned to
  // be readable as "the world is back there" without competing with
  // the gameplay rect for attention.
  const blurStep = useMemo(() => new Vector2(5 / (PLAY_COLS * TILE_PX), 5 / (PLAY_ROWS * TILE_PX)), [])


  // Ambient material — sample game RT with a 9-tap box blur (center
  // + 8 neighbors). Bottom of bg = bottom of viewport (no V-flip on
  // bg sampling: plane V=0 → texture V=0 = deep rows of game).
  // Mild desat + low alpha so the CSS gradient does most of the
  // color work and the bg reads as "back there, faded".
  const ambientMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    const blurredColor = Fn(() => {
      const u = uv()
      const dx = blurStep.x
      const dy = blurStep.y
      // 9-tap blur: center + 4 cross + 4 diagonal neighbors.
      const c = textureNode(gameTexture, u)
      const n = textureNode(gameTexture, u.add(vec2(0, dy)))
      const s = textureNode(gameTexture, u.sub(vec2(0, dy)))
      const e = textureNode(gameTexture, u.add(vec2(dx, 0)))
      const w = textureNode(gameTexture, u.sub(vec2(dx, 0)))
      const ne = textureNode(gameTexture, u.add(vec2(dx, dy)))
      const nw = textureNode(gameTexture, u.add(vec2(-dx, dy)))
      const se = textureNode(gameTexture, u.add(vec2(dx, -dy)))
      const sw = textureNode(gameTexture, u.sub(vec2(dx, dy)))
      const sum = c.add(n).add(s).add(e).add(w).add(ne).add(nw).add(se).add(sw)
      const rgb = sum.rgb.mul(1 / 9)
      const lum = rgb.dot(vec3(0.299, 0.587, 0.114))
      const desat = mix(rgb, vec3(lum, lum, lum), 0.25)
      // Low alpha — the bg should sit visually BEHIND the gameplay,
      // not compete. CSS gradient on the host blends through.
      return vec4(desat, 0.22)
    })
    m.colorNode = blurredColor()
    m.transparent = true
    return m
  }, [gameTexture, blurStep])

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
