import { useMemo } from 'react'
import { type Texture } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { Fn, mix, texture as textureNode, uv, vec2, vec3, vec4 } from 'three/tsl'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { PLAY_COLS, PLAY_ROWS, TILE_PX } from '../constants'
import { pickScale } from '../lib/scale'

interface Props {
  gameTexture: Texture
  viewportSize: { width: number; height: number }
}

/**
 * In-canvas compositor (post Flatland-render-to-RT). The RT already
 * contains the full composite of biome gradient + sprites (the
 * gradient mesh lives inside Flatland's scene), so the compositor's
 * job is just to display the RT in two ways:
 *
 *   layer 0 (ambient effect) — opaque scaled+blurred version of the
 *     RT, aspect-fit to viewport width, bottom-aligned. Fills the
 *     bg outside the gameplay rect.
 *   layer 1 (foreground)     — pixel-perfect, centered, at the
 *     largest integer scale that fits the viewport.
 *
 * Both sample the same gameTexture; both V-flip on read (RT buffer
 * Y-up vs. plane UV Y-up vs. screen Y-down — the V-flip aligns
 * everything top-of-game = top-of-screen).
 */
export function Compositor({ gameTexture, viewportSize }: Props) {
  const scale = pickScale(viewportSize.width, viewportSize.height)
  const rectW = PLAY_COLS * TILE_PX * scale
  const rectH = PLAY_ROWS * TILE_PX * scale

  // Ambient bg — aspect-preserving fit-width, bottom-aligned. With
  // bgAspect = PLAY_ROWS / PLAY_COLS, the plane's bottom sits at
  // viewport bottom and the top can overflow upward off-screen.
  const bgAspect = PLAY_ROWS / PLAY_COLS
  const bgW = viewportSize.width
  const bgH = bgW * bgAspect
  const bgY = -viewportSize.height / 2 + bgH / 2

  // Ambient material — opaque gaussian blur of the RT.
  const ambientMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    const flipped = textureNode(gameTexture, vec2(uv().x, uv().y.oneMinus()))
    const blurred = gaussianBlur(flipped, null, 4)
    const composed = Fn(() => {
      const rgb = blurred.rgb
      const lum = rgb.dot(vec3(0.299, 0.587, 0.114))
      const desat = mix(rgb, vec3(lum, lum, lum), 0.25)
      return vec4(desat, 1)
    })
    m.colorNode = composed()
    m.transparent = false
    return m
  }, [gameTexture])

  // Foreground material — opaque passthrough of the RT (V-flipped).
  // The RT already has gradient + sprites composited; no additional
  // compositing here.
  const fgMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    m.colorNode = textureNode(gameTexture, vec2(uv().x, uv().y.oneMinus()))
    m.transparent = false
    return m
  }, [gameTexture])

  return (
    <>
      <mesh material={ambientMaterial} position={[0, bgY, -1]}>
        <planeGeometry args={[bgW, bgH]} />
      </mesh>
      <mesh material={fgMaterial} position={[0, 0, 0]}>
        <planeGeometry args={[rectW, rectH]} />
      </mesh>
    </>
  )
}
