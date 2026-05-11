import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useWorld } from 'koota/react'
import { type Texture } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Fn,
  clamp,
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
  // Parallax factor for the biome gradient layer. <1 means the
  // gradient scrolls slower than the digger — distant feel. 0.85 is
  // close enough to 1 that the player observably traverses the
  // start → end color fade WITHIN each biome's body descent (a
  // little lag, not so much that the gradient never reaches the
  // end color before crossing into the next biome). Bumped up from
  // 0.35 which was too slow to see transitions.
  const PARALLAX = 0.85
  // At absolute world depth 0 (the world's surface, before any
  // descent), the gradient fades from a "sky blue" overlay color
  // through the topsoil biome's natural start color across the
  // first SKY_FADE_PX of depth. This applies ONLY at true depth
  // 0..SKY_FADE_PX — once the player descends or the gradient
  // texture cycles past one full world, the sky doesn't re-appear.
  const SKY_BLUE: [number, number, number] = [0.30, 0.45, 0.66] // ~#4d73a8
  const SKY_FADE_PX = 30 * TILE_PX // 30 rows
  const gradientMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    const totalPx = gradientTotalRows * TILE_PX
    const colorNode = Fn(() => {
      const viewportPxY = uv().y.oneMinus().mul(viewportSize.height)
      const worldPxY = viewportPxY.add(camYUniform.mul(PARALLAX))
      const gradV = worldPxY.div(totalPx)
      const baseColor = textureNode(gradientTexture, vec2(float(0.5), gradV)).rgb
      // Sky-fade: only for the very first descent. Once worldPxY >
      // SKY_FADE_PX, skyMix = 0 (no sky influence).
      const skyMix = clamp(float(1).sub(worldPxY.div(SKY_FADE_PX)), 0, 1)
      const sky = vec3(SKY_BLUE[0], SKY_BLUE[1], SKY_BLUE[2])
      const finalColor = mix(baseColor, sky, skyMix)
      return vec4(finalColor, 1)
    })
    m.colorNode = colorNode()
    m.transparent = false
    return m
  }, [gradientTexture, gradientTotalRows, viewportSize.height, camYUniform])

  // Layer 1 — gaussian-blurred ambient bg. OPAQUE — covers the
  // gradient layer (z=-2) wherever the ambient plane draws. This
  // keeps the gradient from "applying twice" (showing through a
  // semi-transparent ambient on top of the gradient). The gradient
  // is reserved for the gameplay rect's AIR cells (via fg composite)
  // — that's the only place it's visible. Outside the gameplay rect,
  // the player sees the scaled+blurred game ambient.
  const ambientMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    const flippedTex = textureNode(gameTexture, vec2(uv().x, uv().y.oneMinus()))
    const blurred = gaussianBlur(flippedTex, null, 4)
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

  // Layer 3 — pixel-perfect gameplay rect. The game RT (= what the
  // user calls "the game") composites OVER the biome gradient
  // sampled at the SAME parallax rate as the bg layer. The
  // gradient is a "distant" parallax layer; it scrolls slower than
  // the digger, both behind the viewport AND inside the gameplay
  // rect's AIR cells. Visually, the gradient looks continuous
  // across the screen at any moment — same fragment in screen
  // coords sees the same gradient row.
  //
  // Math for converting fg uv.y → screen DOM Y (Y grows down,
  // 0 = top, viewportH = bottom): the gameplay rect is centered, so
  //   u.y=1 (rect top)    → screenDomY = (viewportH - rectH) / 2
  //   u.y=0 (rect bottom) → screenDomY = (viewportH + rectH) / 2
  // Then worldPxY = screenDomY + camY * PARALLAX (same formula as bg).
  const fgMaterial = useMemo(() => {
    const m = new MeshBasicNodeMaterial()
    const totalPx = gradientTotalRows * TILE_PX
    const composed = Fn(() => {
      const u = uv()
      const rectBottom = (viewportSize.height + rectH) / 2
      const screenDomY = float(rectBottom).sub(u.y.mul(rectH))
      const worldPxY = screenDomY.add(camYUniform.mul(PARALLAX))
      const gradV = worldPxY.div(totalPx)
      const baseColor = textureNode(gradientTexture, vec2(float(0.5), gradV)).rgb
      // Same sky-fade as bg layer — applies only at absolute world
      // depth 0..SKY_FADE_PX. Keeps the gameplay rect's AIR cells
      // continuous with the bg.
      const skyMix = clamp(float(1).sub(worldPxY.div(SKY_FADE_PX)), 0, 1)
      const sky = vec3(SKY_BLUE[0], SKY_BLUE[1], SKY_BLUE[2])
      const bgColor = mix(baseColor, sky, skyMix)
      const game = textureNode(gameTexture, vec2(u.x, u.y.oneMinus()))
      const rgb = mix(bgColor, game.rgb, game.a)
      return vec4(rgb, 1)
    })
    m.colorNode = composed()
    m.transparent = false
    return m
  }, [
    gameTexture,
    gradientTexture,
    gradientTotalRows,
    camYUniform,
    rectH,
    viewportSize.height,
  ])

  // Suppress unused-import after dropping biome-rect.
  void color

  return (
    <>
      <mesh material={gradientMaterial} position={[0, 0, -2]}>
        <planeGeometry args={[viewportSize.width, viewportSize.height]} />
      </mesh>
      <mesh material={ambientMaterial} position={[0, bgY, -1]}>
        <planeGeometry args={[bgW, bgH]} />
      </mesh>
      <mesh material={fgMaterial} position={[0, 0, 0]}>
        <planeGeometry args={[rectW, rectH]} />
      </mesh>
    </>
  )
}
