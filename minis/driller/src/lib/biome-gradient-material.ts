import { Mesh, PlaneGeometry, type Texture, type Uniform } from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Fn,
  clamp,
  float,
  mix,
  texture as textureNode,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import { PLAY_COLS, PLAY_ROWS, TILE_PX } from '../constants'
import { buildBiomeGradientTexture } from './biome-gradient'

/**
 * Parallax factor — the gradient scrolls at this fraction of the
 * digger's scroll rate. MUST be 1.0: the gradient LUT is keyed to
 * world depth, so any value <1 desyncs biome color transitions from
 * actual biome boundaries (e.g., at 0.85 the void fade-to-black
 * appears ~30 rows late, dragging biome N's color through biome
 * N+1's start). For "distance feel" parallax, use a separate
 * ambient/noise layer that's NOT tied to biome identity.
 */
export const GRADIENT_PARALLAX = 1.0

/** Rows of sky-fade at absolute depth 0 (before any descent). */
export const SKY_FADE_ROWS = 30
const SKY_FADE_PX = SKY_FADE_ROWS * TILE_PX

/** Sky overlay color (mid blue). Mixed in only at world depth 0..SKY_FADE_PX. */
const SKY_BLUE: readonly [number, number, number] = [0.3, 0.45, 0.66]

interface BiomeGradient {
  /** The Mesh to add to Flatland's scene (sibling of sprites). */
  mesh: Mesh
  /** Uniform driving the parallax — set to `Camera.y` each frame. */
  camYUniform: ReturnType<typeof uniform>
  /** Dispose all owned GPU resources. */
  dispose: () => void
}

/**
 * Build a fullscreen gradient mesh that renders INSIDE Flatland's
 * scene render target. The mesh covers the gameplay rect (PLAY_COLS
 * × PLAY_ROWS world-pixels) and must be re-positioned each frame to
 * track the Flatland camera (so it always fills the visible area).
 *
 * Sample logic per fragment:
 *   1. Convert mesh UV.y to "screen Y within rect" (top → 0, bottom → 640).
 *   2. Add `camYUniform * GRADIENT_PARALLAX` for parallax-scaled depth.
 *   3. Sample the baked biome-gradient texture by that world depth.
 *   4. Mix sky-blue over the top for absolute depth 0..SKY_FADE_PX.
 *
 * The mesh's material is OPAQUE and depth-writing, so sprites (in
 * the spriteGroup, drawn after) overlay it cleanly. AIR pixels of
 * the rendered scene (cleared with alpha=0) leave the gradient
 * visible in the RT.
 */
export function buildBiomeGradientMesh(): BiomeGradient {
  const { texture: gradientTexture, totalRows } = buildBiomeGradientTexture()
  const totalPx = totalRows * TILE_PX
  const camYUniform = uniform(0)

  const material = new MeshBasicNodeMaterial()
  const rectH = PLAY_ROWS * TILE_PX
  const skyColor = vec3(SKY_BLUE[0], SKY_BLUE[1], SKY_BLUE[2])
  const colorNode = Fn(() => {
    // uv.y goes 0 (mesh bottom) to 1 (mesh top). Translate to
    // "screen pixel y" where 0 = top of rect, 640 = bottom.
    const screenPxY = uv().y.oneMinus().mul(rectH)
    const worldPxY = screenPxY.add(camYUniform.mul(GRADIENT_PARALLAX))
    const gradV = worldPxY.div(totalPx)
    const baseColor = textureNode(gradientTexture, vec2(float(0.5), gradV)).rgb
    // Sky-fade — only at absolute depth < SKY_FADE_PX. Outside, mix=0.
    const skyMix = clamp(float(1).sub(worldPxY.div(SKY_FADE_PX)), 0, 1)
    const finalColor = mix(baseColor, skyColor, skyMix)
    return vec4(finalColor, 1)
  })
  // Three's TSL helper types cannot currently represent this Fn node precisely.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  material.colorNode = colorNode()
  material.transparent = false
  material.depthWrite = true
  material.depthTest = true

  const geometry = new PlaneGeometry(PLAY_COLS * TILE_PX, PLAY_ROWS * TILE_PX)
  const mesh = new Mesh(geometry, material)
  // Render behind sprites — sprites in spriteGroup are at z=0; the
  // mesh at z=-1 is depth-sorted first (further from camera).
  mesh.position.z = -1
  mesh.renderOrder = -100
  mesh.frustumCulled = false

  const dispose = () => {
    geometry.dispose()
    material.dispose?.()
    gradientTexture.dispose()
  }

  return { mesh, camYUniform, dispose }
}

export type { Uniform, Texture }
