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
    pixels instanceof Uint8Array
      ? pixels
      : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
  return bakeNormalMap(src, width, height, descriptor)
}

export type LightVector = { x: number; y: number; z: number }

/**
 * Decode a baked normal map's R/G channels into unit tangent-space
 * normals — `nz` reconstructed as `sqrt(1 − nx² − ny²)`, matching the
 * encode convention documented in `packages/normals/src/bake.ts` (nz is
 * never written; it's always ≥ 0 by the outward-facing convention) — and
 * compute per-pixel 2D Lambert `max(0, N·L)`, alpha-masked by the source.
 * `light` need not be pre-normalized; it's normalized internally.
 */
export function computeLitComposite(
  normalRGBA: Uint8Array | Uint8ClampedArray,
  light: LightVector
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(normalRGBA.length)
  const len = Math.hypot(light.x, light.y, light.z) || 1
  const lx = light.x / len
  const ly = light.y / len
  const lz = light.z / len
  for (let i = 0; i < normalRGBA.length; i += 4) {
    const nx = (normalRGBA[i]! / 255) * 2 - 1
    const ny = (normalRGBA[i + 1]! / 255) * 2 - 1
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz)
    const v = Math.round(ndotl * 255)
    out[i] = v
    out[i + 1] = v
    out[i + 2] = v
    out[i + 3] = normalRGBA[i + 3]!
  }
  return out
}

/**
 * Light position for the rotating rig — orbits at a fixed elevation so
 * the sweep reads as a light circling overhead rather than dipping below
 * the surface. `timeSeconds` is expected to come from a rAF loop;
 * `reducedMotion` pins the light at `theta = 0` (a fixed, still key
 * light) instead of advancing it.
 */
export function orbitingLight(
  timeSeconds: number,
  opts: { hz?: number; elevation?: number; reducedMotion?: boolean } = {}
): LightVector {
  const hz = opts.hz ?? 0.08
  const elevation = Math.max(0, Math.min(1, opts.elevation ?? 0.6))
  const theta = opts.reducedMotion ? 0 : timeSeconds * hz * Math.PI * 2
  const horizontal = Math.sqrt(Math.max(0, 1 - elevation * elevation))
  return { x: Math.cos(theta) * horizontal, y: Math.sin(theta) * horizontal, z: elevation }
}
