/**
 * GemBackground (R3F) — gem-tinted backdrop for example scenes.
 *
 * Three layers, two primitives (mirroring the Three.js variant in
 * `examples/three/template/GemBackground.ts`):
 *
 *   L1 — flat gem-tinted clear color.
 *        <color attach="background" args={[gemClearColor(GEM).getHex()]} />
 *
 *   L2 — lit TSL radial gradient (canonical example backdrop).
 *        <GemBackground gem={GEM} />
 *        // sets scene.backgroundNode under the hood; renders fullscreen.
 *
 *   L3 — same TSL node, composed inside an example's own pipeline.
 *        const gemNode = useGemGradient(GEM)
 *        // someMaterial.colorNode = mix(originalNode, gemNode, 0.5)
 *
 * The radial gradient's color stops mirror the GalleryTile poster CSS
 * (circle at 30% 30%, three stops: gem40+card → gem12+bg → bg) so the
 * captured screenshot matches the masonry tile's pre-capture fallback.
 *
 * SOURCE OF TRUTH — this file is copied to every R3F example by
 * `scripts/sync-examples.ts` (precommit hook re-syncs on edit). Edits
 * land here in `examples/react/template/`.
 */
import { useThree } from '@react-three/fiber/webgpu'
import { useEffect, useMemo } from 'react'
import { Color } from 'three'
import {
  Fn,
  float,
  length,
  mix,
  mx_noise_float,
  screenSize,
  screenUV,
  smoothstep,
  time,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'

// Gem hex values mirror packages/starlight-theme/styles/theme.css dark
// theme tokens, OKLCH→sRGB. Kept in sync via gems.config.ts.
const GEM_HEX = {
  diamond: 0x00c4e9,
  emerald: 0x00c38b,
  gold: 0xd29a00,
  amethyst: 0x995bff,
  ruby: 0xeb3c67,
  pink: 0xe875c6,
  salmon: 0xf3562e,
  turquoize: 0x2bd2c2,
} as const

export type Gem = keyof typeof GEM_HEX

const BG = vec3(0x00 / 255, 0x02 / 255, 0x1c / 255)
const CARD = vec3(0x16 / 255, 0x19 / 255, 0x1f / 255)

/**
 * L1 primitive — flat color tinted by the gem.
 *
 * Returns a `Color` mixed at ~25% gem into the page background. A
 * direct CSS-mirror at 12% (the tile gradient's outer-ring stop)
 * collapses every gem to "near-#00021c with a hint" — nothing reads
 * as the gem visually. 25% lifts the color enough that the L1-only
 * case (e.g. knightmark) and the canvas margins of L2-rendered
 * examples retain a recognizable gem identity.
 */
export function gemClearColor(gem: Gem): Color {
  const gemColor = new Color(GEM_HEX[gem])
  const bg = new Color(0x00021c)
  return new Color().lerpColors(bg, gemColor, 0.25)
}

/**
 * L2 / L3 primitive — TSL fragment node returning vec4 of the gem-
 * tinted radial gradient.
 *
 * Used internally by `<GemBackground>` and exposed via the
 * `useGemGradient` hook for L3 composition (e.g. blending into a
 * custom material's colorNode).
 *
 * `lit` opt-in adds perlin-driven light-center wander. Off by default
 * for deterministic captures.
 */
export function gemGradientNode({
  gem,
  lit = false,
}: {
  gem: Gem
  lit?: boolean
}) {
  // Bake the gem color in as a vec3 constant (not a uniform). See the
  // matching note in examples/three/template/GemBackground.ts — the
  // uniform path didn't reliably bind in the scene.backgroundNode
  // pass, producing dark/blue output regardless of gem.
  const c = new Color(GEM_HEX[gem])
  const gemColor = vec3(float(c.r), float(c.g), float(c.b))

  return Fn(() => {
    // Replicate CSS `radial-gradient(circle at 30% 30%, ...)` exactly.
    // Pixel-space distance + farthest-corner normalization keeps the
    // gradient circular regardless of viewport aspect ratio. See
    // examples/three/template/GemBackground.ts for the full rationale.
    const screenPx = screenSize
    const centerNorm = vec2(float(0.3), float(0.3))
    const cx = lit ? centerNorm.x.add(mx_noise_float(time.mul(0.05).add(vec2(0))).mul(0.04)) : centerNorm.x
    const cy = lit
      ? centerNorm.y.add(mx_noise_float(time.mul(0.05).add(vec2(100))).mul(0.04))
      : centerNorm.y
    const centerPx = vec2(cx, cy).mul(screenPx)
    const fragPx = screenUV.mul(screenPx)
    const dPx = length(fragPx.sub(centerPx))
    const d = dPx.div(length(screenPx).mul(0.7))

    // Two-stop gradient, both gem-tinted. See note in the Three.js
    // template — at example viewport scale the CSS's third stop (bg
    // fadeout) makes the outer 40% of the screen read as flat dark
    // blue regardless of gem. Drop the fadeout, both stops carry gem.
    //
    //   0%   → mix(card, gem, 0.50)   center, gem-saturated
    //   85%  → mix(bg,   gem, 0.30)   ambient, still recognizably gem
    const c0 = mix(CARD, gemColor, float(0.5))
    const c1 = mix(BG, gemColor, float(0.3))

    const t = smoothstep(float(0), float(0.85), d)
    return vec4(mix(c0, c1, t), float(1))
  })()
}

/**
 * Hook returning a TSL gem gradient node. Memoized per gem/lit combo
 * so the same node instance is reused across renders.
 *
 * For L3 composition:
 *   const gem = useGemGradient('emerald')
 *   const finalColor = useMemo(() => mix(myNode, gem, 0.4), [gem])
 *   <meshBasicNodeMaterial colorNode={finalColor} />
 */
export function useGemGradient(gem: Gem, lit = false) {
  return useMemo(() => gemGradientNode({ gem, lit }), [gem, lit])
}

/**
 * L2 component — sets `scene.backgroundNode` to the gem gradient,
 * which three.js renders as a fullscreen quad behind the rest of
 * the scene. No mesh management, no resize handling needed; cleans
 * up on unmount.
 */
export function GemBackground({ gem, lit = false }: { gem: Gem; lit?: boolean }) {
  const scene = useThree((s) => s.scene)
  const node = useGemGradient(gem, lit)

  useEffect(() => {
    const previous = scene.backgroundNode
    scene.backgroundNode = node
    return () => {
      scene.backgroundNode = previous
    }
  }, [scene, node])

  return null
}
