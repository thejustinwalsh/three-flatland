import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import { type Texture } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Fn,
  color,
  float,
  mix,
  texture as textureNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { Camera } from '../traits'
import { PLAY_COLS, PLAY_ROWS, TILE_PX } from '../constants'
import { buildBiomeGradientTexture } from '../lib/biome-gradient'
import { pickScale } from '../lib/scale'

interface Props {
  gameTexture: Texture
  viewportSize: { width: number; height: number }
}

/**
 * In-canvas compositor — 4 layers, back-to-front:
 *
 *   layer 0 (z=-2)    — depth-aware biome gradient. Pre-baked 1×N
 *                       DataTexture cycling through all biomes; the
 *                       shader maps each viewport row to a world row
 *                       (with parallax-scaled camera Y) and samples
 *                       the gradient. Voids are mostly pure black
 *                       with quick fades at the edges.
 *   layer 1 (z=-1)    — gaussian-blurred sample of the game RT,
 *                       fit-width / clip-height / bottom-aligned,
 *                       low alpha. Adds "shape" to the bg.
 *   layer 2 (z=-0.01) — opaque biome-colored quad behind the
 *                       gameplay rect. Blocks the bg layers from
 *                       bleeding through AIR cells in the gameplay.
 *   layer 3 (z=0)     — pixel-perfect game RT at PLAY_COLS × PLAY_ROWS,
 *                       centered. The actual gameplay rect.
 *
 * The host element's CSS background is now a single solid color —
 * no gradients in HTML. All color depth lives in layer 0.
 */
export function Compositor({ gameTexture, viewportSize }: Props) {
  const world = useWorld()
  const scale = pickScale(viewportSize.width, viewportSize.height)
  const rectW = PLAY_COLS * TILE_PX * scale
  const rectH = PLAY_ROWS * TILE_PX * scale

  // Layer 1 bg sizing — aspect-preserving fit-width, bottom-aligned.
  const bgAspect = PLAY_ROWS / PLAY_COLS
  const bgW = viewportSize.width
  const bgH = bgW * bgAspect
  const bgY = -viewportSize.height / 2 + bgH / 2

  // Layer 0 — biome gradient texture (1×N) + uniform for parallax
  // camera Y. Update the uniform each frame from the Camera trait.
  const { texture: gradientTexture, totalRows: gradientTotalRows } = useMemo(
    () => buildBiomeGradientTexture(),
    [],
  )
  const camYUniform = useMemo(() => uniform(0), [])
  useFrame(() => {
    const cam = world.get(Camera)
    if (cam) camYUniform.value = cam.y
  })

  // Layer 0 material — biome depth gradient. The plane is fullscreen
  // (viewport-sized), positioned at z=-2. Per-fragment math:
  //   fragWorldPxY = (1 - uv.y) * viewportH  + camY * parallax
  //   gradientV    = (fragWorldPxY / TILE_PX) / TOTAL_ROWS  (mod 1)
  //
  // (1 - uv.y) because uv.y grows UP in three but world rows grow DOWN.
  // PARALLAX < 1 makes the bg gradient scroll slower than the gameplay
  // foreground — distant-feel.
  const PARALLAX = 0.35
  const gradientMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    const totalPx = gradientTotalRows * TILE_PX
    const colorNode = Fn(() => {
      const viewportPxY = uv().y.oneMinus().mul(viewportSize.height)
      const worldPxY = viewportPxY.add(camYUniform.mul(PARALLAX))
      const gradV = worldPxY.div(totalPx)
      return textureNode(gradientTexture, vec2(float(0.5), gradV))
    })
    m.colorNode = colorNode()
    m.transparent = false
    return m
  }, [gradientTexture, gradientTotalRows, viewportSize.height, camYUniform])

  // Layer 1 — gaussian-blurred ambient bg (game RT).
  const ambientMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    const flippedTex = textureNode(gameTexture, vec2(uv().x, uv().y.oneMinus()))
    const blurred = gaussianBlur(flippedTex, null, 4)
    const composed = Fn(() => {
      const rgb = blurred.rgb
      const lum = rgb.dot(vec3(0.299, 0.587, 0.114))
      const desat = mix(rgb, vec3(lum, lum, lum), 0.25)
      return vec4(desat, 0.18)
    })
    m.colorNode = composed()
    m.transparent = true
    return m
  }, [gameTexture])

  // Layer 3 — pixel-perfect gameplay rect (V-flipped game RT sample).
  const fgMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    m.colorNode = textureNode(gameTexture, vec2(uv().x, uv().y.oneMinus()))
    m.transparent = true
    return m
  }, [gameTexture])

  // Layer 2 — opaque biome-colored quad behind the foreground.
  // TODO(parallax): replace with 3-4 tile-art layers per biome.
  const biomeRectMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    m.colorNode = vec4(color(0x1a1411).toVec3(), 1)
    m.transparent = false
    return m
  }, [])

  return (
    <>
      <mesh material={gradientMaterial} position={[0, 0, -2]}>
        <planeGeometry args={[viewportSize.width, viewportSize.height]} />
      </mesh>
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
