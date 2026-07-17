import { bakeNormalMap, type NormalSourceDescriptor } from '@three-flatland/normals'

// Live preview math. Region-aware normal-map baking reuses
// `bakeNormalMap` from `@three-flatland/normals` directly — it's pure,
// dependency-free RGBA-buffer math (no fs, no pngjs; those live behind
// `@three-flatland/normals/node`), so the exact same code path the CLI
// and runtime loader use also drives this in-webview preview. No
// duplicate bake implementation lives in this file.
//
// The lit-composite render (rotating-light preview) has no browser-safe
// counterpart in the package — it's presentation, not part of the bake
// contract — so it's implemented here as plain 2D Lambert math.

/** Bake a preview normal map from decoded source pixels + the live descriptor. */
export function bakePreviewNormalMap(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  descriptor: NormalSourceDescriptor
): Uint8Array {
  const src =
    pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  return bakeNormalMap(src, width, height, descriptor)
}

/**
 * Horizontal light direction (the orbit's x/y) plus the light's OWN
 * world-space height above the ground plane — NOT a pre-combined 3D unit
 * vector. The per-pixel Z component is derived from `lightHeight` and
 * that PIXEL's baked elevation inside `computeLitComposite` (see its doc
 * comment) — a single upfront `{x,y,z}` vector can't represent that,
 * since two texels in the same baked map can sit at different
 * elevations and therefore see the same light at different angles.
 */
export type LightVector = { x: number; y: number; lightHeight: number }

/**
 * Decode a baked normal map's R/G channels into unit tangent-space
 * normals — `nz` reconstructed as `sqrt(1 − nx² − ny²)`, matching the
 * encode convention documented in `packages/normals/src/bake.ts` (nz is
 * never written; it's always ≥ 0 by the outward-facing convention) — and
 * compute per-pixel 2D Lambert `max(0, N·L)`, alpha-masked by the source.
 *
 * The B channel carries per-texel world-space elevation in [0, 1] (see
 * `packages/normals/src/bake.ts`'s encode comment and
 * `packages/three-flatland/src/materials/channels.ts`'s `elevation`
 * channel doc). The real-time renderer's `DefaultLightEffect` computes,
 * per fragment per light (`packages/presets/src/lighting/DefaultLightEffect.ts:296`):
 *
 *   lightDir3D = normalize(vec3(toLightN, lightHeight - ctx.elevation))
 *   NdotL = clamp(dot(normal, lightDir3D), 0, 1)
 *
 * — this preview reproduces the Z term (`lightHeight - elevation`,
 * per-fragment) and the clamped dot product exactly. The one honest
 * divergence: `toLightN` in the real shader is the normalized direction
 * FROM the fragment TO the light's actual world position (a positional
 * point/spot light — every fragment sees a slightly different XY
 * direction). A 2D canvas preview has no world-space fragment position
 * to compute that from without inventing one, so `light.x`/`light.y`
 * here are a single orbit direction applied uniformly to every pixel —
 * closer to a directional ("sun") light's XY than a point light's. The
 * Z-axis behavior that actually depends on elevation (the part this fix
 * is about) is unaffected by that simplification. `light.x`/`light.y`
 * need not be pre-normalized; the full (x, y, lightHeight − elevation)
 * vector is normalized per pixel, since elevation varies pixel-to-pixel
 * and so, therefore, does the light's effective direction.
 */
export function computeLitComposite(normalRGBA: Uint8Array | Uint8ClampedArray, light: LightVector): Uint8ClampedArray {
  const out = new Uint8ClampedArray(normalRGBA.length)
  for (let i = 0; i < normalRGBA.length; i += 4) {
    const nx = (normalRGBA[i]! / 255) * 2 - 1
    const ny = (normalRGBA[i + 1]! / 255) * 2 - 1
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    const elevation = normalRGBA[i + 2]! / 255
    const lz = light.lightHeight - elevation
    const len = Math.hypot(light.x, light.y, lz) || 1
    const lx = light.x / len
    const ly = light.y / len
    const lzNorm = lz / len
    const ndotl = Math.max(0, nx * lx + ny * ly + nz * lzNorm)
    const v = Math.round(ndotl * 255)
    out[i] = v
    out[i + 1] = v
    out[i + 2] = v
    out[i + 3] = normalRGBA[i + 3]!
  }
  return out
}

/**
 * Light position for the rotating rig — orbits horizontally at a fixed
 * `lightHeight` above the ground plane (0.75 by default, matching the
 * worked example in `packages/three-flatland/src/loaders/normalDescriptor.ts`'s
 * `DEFAULT_FACE_ELEVATION` doc comment: a torch at height 0.75 lights a
 * face at elevation 0.5 from slightly above, which reads as natural
 * down-lighting). `timeSeconds` is expected to come from a rAF loop;
 * `reducedMotion` pins the light at `theta = 0` (a fixed, still key
 * light) instead of advancing it.
 */
export function orbitingLight(
  timeSeconds: number,
  opts: { hz?: number; lightHeight?: number; reducedMotion?: boolean } = {}
): LightVector {
  const hz = opts.hz ?? 0.08
  const lightHeight = opts.lightHeight ?? 0.75
  const theta = opts.reducedMotion ? 0 : timeSeconds * hz * Math.PI * 2
  return { x: Math.cos(theta), y: Math.sin(theta), lightHeight }
}
