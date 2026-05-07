/**
 * GemBackground — gem-tinted backdrop for example scenes.
 *
 * Three layers, two primitives:
 *
 *   L1 — flat gem-tinted clear color.
 *        const bg = gemClearColor(GEM)
 *        scene.background = bg
 *        // or for examples that drive the renderer directly:
 *        renderer.setClearColor(bg)
 *
 *   L2 — lit TSL radial gradient (canonical example backdrop).
 *        scene.backgroundNode = gemGradientNode({ gem: GEM })
 *        // three.js renders this as a fullscreen quad in WebGPU mode.
 *
 *   L3 — same TSL node, composed inside an example's own pipeline.
 *        // e.g. blend the gem fragment into a custom material's colorNode:
 *        const gem = gemGradientNode({ gem: GEM })
 *        material.colorNode = mix(material.colorNode, gem, gemMix)
 *
 * The radial gradient's color stops mirror the GalleryTile poster CSS
 * (circle at 30% 30%, three stops: gem40+card → gem12+bg → bg) so the
 * captured screenshot matches the masonry tile's pre-capture fallback.
 *
 * SOURCE OF TRUTH — this file is copied to every example by
 * `scripts/sync-examples.ts` (precommit hook re-syncs on edit). Edits
 * land here in `examples/three/template/`.
 */
import { Color } from 'three'
import {
  Fn,
  float,
  length,
  mix,
  mx_noise_float,
  screenUV,
  smoothstep,
  time,
  uniform,
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

// Background color (matches example default `#00021c`) and card surface
// color (gray-7-ish, matches CSS `--card`). The tile gradient mixes gem
// into both, with stops at 0% / 60% / 100%.
const BG = vec3(0x00 / 255, 0x02 / 255, 0x1c / 255)
const CARD = vec3(0x16 / 255, 0x19 / 255, 0x1f / 255)

/**
 * L1 primitive — flat color tinted by the gem.
 *
 * Returns a `Color` matching the tile gradient's outer-ring tone (gem
 * mixed at 12% into the page background), so even examples that opt
 * out of the L2 backdrop still read as the right gem at the canvas
 * edges.
 */
export function gemClearColor(gem: Gem): Color {
  const gemColor = new Color(GEM_HEX[gem])
  const bg = new Color(0x00021c)
  return new Color().lerpColors(bg, gemColor, 0.12)
}

/**
 * L2 / L3 primitive — TSL fragment node returning vec4 of the gem-
 * tinted radial gradient.
 *
 * Set as `scene.backgroundNode` for L2 (canonical scene backdrop) or
 * compose into another material's color node for L3 (e.g. skia floor).
 *
 * `lit` opt-in adds perlin-driven light-center wander matching the
 * holo motion vocabulary used elsewhere in the docs. Off by default
 * for deterministic captures; enable in live examples that want the
 * subtle motion. Honors `prefers-reduced-motion: reduce` automatically
 * via the `lit` consumer (capture script forces `lit=false`; live
 * examples can branch on the media query).
 */
export function gemGradientNode({
  gem,
  lit = false,
}: {
  gem: Gem
  lit?: boolean
}) {
  const gemColor = uniform(new Color(GEM_HEX[gem]))

  return Fn(() => {
    const uv = screenUV
    const aspect = float(1).toVar()

    // Light center: 30% / 30% by default (matches CSS tile). When lit,
    // perturb by a slow perlin sample around that center — sub-perceptual
    // wander, ≤ 4% of viewport.
    const cx = lit ? float(0.3).add(mx_noise_float(time.mul(0.05).add(vec2(0))).mul(0.04)) : float(0.3)
    const cy = lit
      ? float(0.3).add(mx_noise_float(time.mul(0.05).add(vec2(100))).mul(0.04))
      : float(0.3)
    const center = vec2(cx, cy)

    // Radial distance, normalized so d=1 covers the diagonal.
    const d = length(uv.sub(center)).mul(aspect.add(1))

    // Three stops (CSS):
    //   0%   → mix(card, gem, 0.40)   center, most saturated
    //   60%  → mix(bg,   gem, 0.12)   subtle outer tint
    //   100% → bg                      page background
    const c0 = mix(CARD, gemColor, float(0.4))
    const c1 = mix(BG, gemColor, float(0.12))
    const c2 = BG

    const t0 = smoothstep(float(0), float(0.6), d) // center → outer-ring
    const t1 = smoothstep(float(0.6), float(1), d) // outer-ring → bg
    const inner = mix(c0, c1, t0)
    const outer = mix(c1, c2, t1)
    const blend = smoothstep(float(0.55), float(0.65), d)
    return vec4(mix(inner, outer, blend), float(1))
  })()
}
