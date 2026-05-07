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

// ───────── OKLab color-mix ─────────
// Mirrors CSS `color-mix(in oklab, A pct, B)`. We precompute the three
// gradient stops in JS using OKLab interpolation (perceptually uniform,
// what CSS uses for color-mix), then bake the resulting sRGB-encoded
// values as vec3 constants in the shader. The shader's smoothstep
// blending between stops then runs in sRGB-encoded space (matching
// CSS's default radial-gradient stop interpolation), with a final
// sRGB→linear conversion before output so the renderer's gamma encode
// produces the intended sRGB display values.
// Reference: https://bottosson.github.io/posts/oklab/

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}
function rgbToOklab(r: number, g: number, b: number) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ] as const
}
function oklabToRgb(L: number, a: number, b: number) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ] as const
}
function hexToSrgbTriple(hex: number) {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255] as const
}

/**
 * Mimics CSS `color-mix(in oklab, hexA pct, hexB)`. Returns the result
 * in sRGB-encoded space (0..1 floats per channel) — same encoding as
 * CSS hex literals, ready to bake into the shader as a vec3 constant.
 */
function oklabMix(hexA: number, hexB: number, mixA: number) {
  const [aR, aG, aB] = hexToSrgbTriple(hexA).map(srgbToLinear) as [number, number, number]
  const [bR, bG, bB] = hexToSrgbTriple(hexB).map(srgbToLinear) as [number, number, number]
  const [aL, aA, aB_] = rgbToOklab(aR, aG, aB)
  const [bL, bA, bB_] = rgbToOklab(bR, bG, bB)
  const L = aL * mixA + bL * (1 - mixA)
  const a_ = aA * mixA + bA * (1 - mixA)
  const b_ = aB_ * mixA + bB_ * (1 - mixA)
  const [lr, lg, lb] = oklabToRgb(L, a_, b_)
  return [
    Math.max(0, Math.min(1, linearToSrgb(lr))),
    Math.max(0, Math.min(1, linearToSrgb(lg))),
    Math.max(0, Math.min(1, linearToSrgb(lb))),
  ] as const
}

// Pre-baked sRGB-encoded BG (no mixing — pure page background).
const BG_SRGB = hexToSrgbTriple(BG_HEX)

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
 * Dark-gem fog/distance color. OKLab-mixed at 10% gem with the page
 * bg (BG_HEX ≈ #111418, OKLab L ≈ 0.18) — perceptually dim
 * (`L ≈ 0.23`) with the gem's chromaticity weighted at 10%. Reads as
 * a desaturated dark with a clear hint of gem identity.
 *
 * Anchor at BG_HEX, not pure black, because OKLab's perceptual L
 * collapses very fast toward zero — 10% of pink's L=0.72 anchored at
 * black gives L=0.07 (near-black on display). Anchoring at BG keeps
 * the result above that perceptual cliff.
 *
 * Sits between gemClearColor (25%) and pure black: the saturation
 * stays in the dark moody zone for 3D demos (skia, etc.) where a
 * full gemClearColor reads as flat gem at the horizon.
 */
export function gemFogColor(gem: Gem): Color {
  const [r, g, b] = oklabMix(GEM_HEX[gem], BG_HEX, 0.1)
  const hex =
    (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255)
  return new Color(hex)
}

/**
 * L2 / L3 primitive — TSL fragment node returning vec4 of the gem-
 * tinted radial gradient.
 *
 * Set as `scene.backgroundNode` for L2 (canonical scene backdrop) or
 * compose into another material's color node for L3 (e.g. skia floor).
 *
 * Gradient center is static at (0.30, 0.30) matching the docs masonry
 * tile (`radial-gradient(circle at 30% 30%, ...)`). With `lit: true`
 * a slow perlin-noise drift adds sub-perceptual ambient motion (≤4%
 * of viewport, no mouse coupling — the masonry tiles don't use mouse
 * influence on the gradient itself either).
 */
export function gemGradientNode({
  gem,
  lit = false,
}: {
  gem: Gem
  lit?: boolean
}) {
  // Pre-compute the three gradient stops in JS using OKLab mixing,
  // matching CSS `color-mix(in oklab, ...)` exactly. The resulting
  // sRGB-encoded values are baked into the shader as vec3 constants —
  // no uniform binding (which historically didn't work in
  // scene.backgroundNode) and no in-shader oklab math.
  const [c0r, c0g, c0b] = oklabMix(GEM_HEX[gem], CARD_HEX, 0.4)
  const [c1r, c1g, c1b] = oklabMix(GEM_HEX[gem], BG_HEX, 0.12)
  const [c2r, c2g, c2b] = BG_SRGB

  // The shader treats these as raw vec3 floats; smoothstep between
  // them runs in sRGB-encoded space (matching CSS's default
  // radial-gradient stop interpolation). The final output gets
  // converted to linear before write so the renderer's gamma encode
  // produces the intended sRGB display values.
  const c0 = vec3(c0r, c0g, c0b)
  const c1 = vec3(c1r, c1g, c1b)
  const c2 = vec3(c2r, c2g, c2b)

  return Fn(() => {
    // Replicate CSS `radial-gradient(circle at 30% 30%, ...)` exactly:
    // - circle in pixel space (not an aspect-stretched ellipse)
    // - extent = farthest-corner (distance from (0.3,0.3) center to
    //   (1,1) corner = 0.7 × screen-diagonal length)
    const screenPx = screenSize
    const cx = lit
      ? float(0.3).add(mx_noise_float(time.mul(0.05).add(vec2(0))).mul(0.04))
      : float(0.3)
    const cy = lit
      ? float(0.3).add(mx_noise_float(time.mul(0.05).add(vec2(100))).mul(0.04))
      : float(0.3)
    const centerPx = vec2(cx, cy).mul(screenPx)
    const fragPx = screenUV.mul(screenPx)
    const d = length(fragPx.sub(centerPx)).div(length(screenPx).mul(0.7))

    // Stop interpolation in sRGB-encoded space (matches CSS default
    // for `radial-gradient` without an explicit `in <space>` keyword).
    const t0 = smoothstep(float(0), float(0.6), d)
    const t1 = smoothstep(float(0.6), float(1), d)
    const inner = mix(c0, c1, t0)
    const outer = mix(c1, c2, t1)
    const blend = smoothstep(float(0.55), float(0.65), d)
    const sRGB = mix(inner, outer, blend)

    // sRGB-encoded → linear-sRGB so the renderer's output gamma encode
    // (linear → sRGB) produces the same display value the hex literal
    // encodes. pow(2.2) is the common approximation; the segmented
    // sRGB transfer function is more accurate but the deviation only
    // matters near-black. `.pow()` on a vec3 takes a vec3 exponent.
    const linear = sRGB.pow(vec3(float(2.2)))
    return vec4(linear, float(1))
  })()
}
