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
  screenSize,
  screenUV,
  smoothstep,
  time,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'

// Gem + surface hex values mirror packages/starlight-theme/styles/theme.css
// dark theme tokens, OKLCH→sRGB. Kept in sync via gems.config.ts.
//
// The previous BG/CARD values (0x00021c / 0x16191f) were wrong — the
// real --background and --card tokens are oklch(18%) / oklch(20%) on the
// 250 hue, which converts to ~0x111418 / ~0x16191e (medium gray-blue,
// not near-black blue). With the wrong constants, every example
// rendered noticeably darker than the surrounding docs page.
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

const BG_HEX = 0x111418
const CARD_HEX = 0x16191e

export type Gem = keyof typeof GEM_HEX

const BG = vec3(((BG_HEX >> 16) & 0xff) / 255, ((BG_HEX >> 8) & 0xff) / 255, (BG_HEX & 0xff) / 255)
const CARD = vec3(
  ((CARD_HEX >> 16) & 0xff) / 255,
  ((CARD_HEX >> 8) & 0xff) / 255,
  (CARD_HEX & 0xff) / 255,
)

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
  const bg = new Color(BG_HEX)
  return new Color().lerpColors(bg, gemColor, 0.25)
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
  // Bake the gem color in as a vec3 constant rather than a uniform.
  // `scene.backgroundNode` builds its shader independently from the
  // main render pass; uniforms wrapped via `uniform(new Color(...))`
  // didn't reliably bind in the background pass on at least Chrome
  // 127 + WebGPU, producing dark/blue output regardless of gem. A
  // baked vec3 sidesteps the binding entirely and matches identical
  // output across all callsites (background, scene-graph, L3 mixins).
  const c = new Color(GEM_HEX[gem])
  const gemColor = vec3(float(c.r), float(c.g), float(c.b))

  return Fn(() => {
    // Replicate CSS `radial-gradient(circle at 30% 30%, ...)` exactly:
    // - circle = literal circle in pixel space (NOT an ellipse stretched
    //   by aspect ratio). Computed by working in pixel coords, not UV.
    // - default extent = farthest-corner. Center at (0.3, 0.3) means
    //   the (1, 1) corner is farthest for any normal aspect ratio,
    //   and the distance to it is `0.7 * length(screenSize)`.
    const screenPx = screenSize
    const centerNorm = vec2(float(0.3), float(0.3))

    // Optional perlin-driven light wander (≤ 4% of viewport, sub-
    // perceptual). Off by default for deterministic captures.
    const cx = lit ? centerNorm.x.add(mx_noise_float(time.mul(0.05).add(vec2(0))).mul(0.04)) : centerNorm.x
    const cy = lit
      ? centerNorm.y.add(mx_noise_float(time.mul(0.05).add(vec2(100))).mul(0.04))
      : centerNorm.y
    const centerPx = vec2(cx, cy).mul(screenPx)
    const fragPx = screenUV.mul(screenPx)

    // Pixel distance, normalized so d=1 corresponds to CSS's
    // farthest-corner extent. d > 1 stays clamped via smoothstep.
    const dPx = length(fragPx.sub(centerPx))
    const d = dPx.div(length(screenPx).mul(0.7))

    // Two stops, both gem-tinted — the CSS tile uses three stops with
    // the third fading to pure page background, but at example viewport
    // scale that "fade to bg" makes the entire outer 40% of the screen
    // read as flat dark blue regardless of which gem is assigned. The
    // user complaint was "gemtone blue on the outside of the gradient
    // while inner gradient is correct gem color" — i.e. the outer ring
    // wasn't carrying gem identity. Boost outer stop to 30% gem mix
    // (vs. CSS's 12%) and drop the bg fadeout so every visible pixel
    // reads as gem.
    //
    //   0%   → mix(card, gem, 0.50)   center, gem-saturated
    //   85%  → mix(bg,   gem, 0.30)   ambient, still recognizably gem
    const c0 = mix(CARD, gemColor, float(0.5))
    const c1 = mix(BG, gemColor, float(0.3))

    const t = smoothstep(float(0), float(0.85), d)
    return vec4(mix(c0, c1, t), float(1))
  })()
}
