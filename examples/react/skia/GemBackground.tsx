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

// Gem + surface hex values mirror packages/starlight-theme/styles/theme.css
// dark theme tokens, OKLCH→sRGB. See the matching note in
// examples/three/template/GemBackground.ts on why BG_HEX / CARD_HEX
// changed from 0x00021c / 0x16191f to the proper theme tokens.
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
// what CSS uses), bake the resulting sRGB-encoded values as vec3
// constants, and let the shader smoothstep between them in sRGB-encoded
// space (matching CSS's default radial-gradient stop interpolation),
// with a final sRGB→linear conversion before output so the renderer's
// gamma encode produces the intended display values.
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

/** Mimics CSS `color-mix(in oklab, hexA pct, hexB)`. Returns the
 *  result in sRGB-encoded space (0..1 floats per channel). */
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
 * bg (BG_HEX ≈ #111418, L≈0.18). Perceptually dim (L≈0.23) with the
 * gem's chromaticity at 10%. Anchor at BG_HEX, not pure black — OKLab
 * L collapses very fast toward zero (10% of L=0.72 anchored at black
 * gives L=0.07, near-black). Sits between gemClearColor (25%) and
 * pure black for fog/clear on 3D demos (skia, etc.).
 */
export function gemFogColor(gem: Gem): Color {
  const [r, g, b] = oklabMix(GEM_HEX[gem], BG_HEX, 0.1)
  const hex =
    (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255)
  return new Color(hex)
}

/**
 * L2 / L3 primitive — TSL fragment node returning vec4 of the gem-
 * tinted radial gradient. Static center at (0.30, 0.30) matching the
 * docs masonry tile (`radial-gradient(circle at 30% 30%, ...)`).
 * `lit: true` adds slow perlin-noise drift on the light position
 * (≤4% of viewport, sub-perceptual ambient motion).
 *
 * `radius` (default 0.7) — gradient extent across the screen
 * diagonal. Smaller values pull the falloff in faster (most of the
 * screen reads outer-ring `BG`). Used by skia (~0.4) where only
 * part of the canvas is visible behind a 3D scene, so the gem
 * identity stays in a corner instead of dominating the viewport.
 */
export function gemGradientNode({
  gem,
  lit = false,
  radius = 0.7,
}: {
  gem: Gem
  lit?: boolean
  radius?: number
}) {
  // Pre-compute the three gradient stops in JS using OKLab mixing
  // (matches CSS `color-mix(in oklab, ...)` exactly). The sRGB-encoded
  // results are baked as vec3 constants in the shader; smoothstep then
  // blends them in sRGB-encoded space (matching CSS's default
  // radial-gradient stop interpolation), with sRGB→linear at output.
  const [c0r, c0g, c0b] = oklabMix(GEM_HEX[gem], CARD_HEX, 0.4)
  const [c1r, c1g, c1b] = oklabMix(GEM_HEX[gem], BG_HEX, 0.12)
  const [c2r, c2g, c2b] = BG_SRGB

  const c0 = vec3(c0r, c0g, c0b)
  const c1 = vec3(c1r, c1g, c1b)
  const c2 = vec3(c2r, c2g, c2b)

  return Fn(() => {
    const screenPx = screenSize
    const cx = lit
      ? float(0.3).add(mx_noise_float(time.mul(0.05).add(vec2(0))).mul(0.04))
      : float(0.3)
    const cy = lit
      ? float(0.3).add(mx_noise_float(time.mul(0.05).add(vec2(100))).mul(0.04))
      : float(0.3)
    const centerPx = vec2(cx, cy).mul(screenPx)
    const fragPx = screenUV.mul(screenPx)
    const d = length(fragPx.sub(centerPx)).div(length(screenPx).mul(float(radius)))

    // Stop interpolation in sRGB-encoded space (matches CSS).
    const t0 = smoothstep(float(0), float(0.6), d)
    const t1 = smoothstep(float(0.6), float(1), d)
    const inner = mix(c0, c1, t0)
    const outer = mix(c1, c2, t1)
    const blend = smoothstep(float(0.55), float(0.65), d)
    const sRGB = mix(inner, outer, blend)

    // sRGB-encoded → linear-sRGB. The renderer's output gamma encode
    // (linear → sRGB) then produces the intended display value.
    const linear = sRGB.pow(vec3(float(2.2)))
    return vec4(linear, float(1))
  })()
}

/**
 * Canvas2D variant of the gem gradient — paints the same radial
 * pattern as `gemGradientNode` onto a 2D canvas context. Used by
 * compare/diff overlays so the Canvas2D surface BG matches the Slug
 * WebGPU canvas's BG (diff result then highlights actual content
 * differences, not BG mismatch). Default `radius` matches the TSL
 * variant (0.7 of canvas diagonal); center is at (30%, 30%).
 */
export function gemGradientCanvas2D(
  ctx: CanvasRenderingContext2D,
  gem: Gem,
  options: { radius?: number } = {}
): void {
  const radius = options.radius ?? 0.7
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  const [c0r, c0g, c0b] = oklabMix(GEM_HEX[gem], CARD_HEX, 0.4)
  const [c1r, c1g, c1b] = oklabMix(GEM_HEX[gem], BG_HEX, 0.12)
  const [c2r, c2g, c2b] = BG_SRGB
  const cx = w * 0.3
  const cy = h * 0.3
  const r1 = Math.sqrt(w * w + h * h) * radius
  const toCss = (r: number, g: number, b: number) =>
    `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r1)
  grad.addColorStop(0, toCss(c0r, c0g, c0b))
  grad.addColorStop(0.6, toCss(c1r, c1g, c1b))
  grad.addColorStop(1, toCss(c2r, c2g, c2b))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

/**
 * Hook returning a TSL gem gradient node. Memoized per gem/lit/radius
 * combo so the same node instance is reused across renders.
 *
 * For L3 composition:
 *   const gem = useGemGradient('emerald')
 *   const finalColor = useMemo(() => mix(myNode, gem, 0.4), [gem])
 *   <meshBasicNodeMaterial colorNode={finalColor} />
 */
export function useGemGradient(gem: Gem, lit = false, radius = 0.7) {
  return useMemo(() => gemGradientNode({ gem, lit, radius }), [gem, lit, radius])
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
