import {
  DEFAULT_BUMP,
  DEFAULT_PITCH,
  DEFAULT_STRENGTH,
  resolveRegion,
  type NormalSourceDescriptor,
  type ResolvedNormalRegion,
} from './descriptor.js'

/**
 * @deprecated — legacy flat-texture bake options. Use
 * `bakeNormalMap(pixels, w, h, descriptor)` for region-aware control.
 */
export interface BakeOptions {
  /** Scales the alpha gradient before normalization. Default 1. */
  strength?: number
}

/**
 * Produce a tangent-space normal map from source pixels + a descriptor.
 *
 * Cross-platform: browser + node. No filesystem, no pngjs. Used by
 * the CLI baker (wrapped with file I/O) and the runtime loader
 * (called directly on decoded image pixels).
 *
 * Per texel in each region:
 *   1. `bump: 'alpha'` — central-difference gradient on the source
 *      alpha channel, clamped to the region bounds so adjacent regions
 *      (e.g. atlas cells) can't bleed into each other.
 *   2. Compose with a tilt rotation that takes `+Z` to the region's
 *      `direction` at `pitch` radians.
 *   3. Normalize and encode to `rgb = normal * 0.5 + 0.5`. Alpha is
 *      copied from the source so the baked map carries its own
 *      silhouette.
 *
 * Texels outside every region receive the flat normal `(0, 0, 1)`
 * with the source's alpha — safe default for sparse descriptors.
 *
 * @param pixels    RGBA pixel buffer, row-major, 4 bytes per pixel.
 * @param width     Pixel width.
 * @param height    Pixel height.
 * @param descriptor Region / tilt / bump control. Defaults to a single
 *                   whole-texture flat region with alpha-derived bump.
 * @returns RGBA pixel buffer containing the encoded normal map.
 */
export function bakeNormalMap(
  pixels: Uint8Array,
  width: number,
  height: number,
  descriptor: NormalSourceDescriptor = {}
): Uint8Array {
  const out = new Uint8Array(pixels.length)

  // Initialize every texel to flat-normal (nx=0, ny=0), elevation=0,
  // source alpha. Runtime reconstructs nz = sqrt(1 − nx² − ny²) — a
  // zero XY yields nz=1 (flat floor). Regions that cover texels will
  // overwrite; texels outside any region keep this safe default.
  //
  // Encoding layout:
  //   R = nx encoded as (nx * 0.5 + 0.5) * 255   (0.5 = 128)
  //   G = ny encoded the same                     (0.5 = 128)
  //   B = elevation in [0, 1] scaled to [0, 255]  (0 = ground default)
  //   A = source alpha preserved
  for (let i = 0; i < pixels.length; i += 4) {
    out[i] = 128
    out[i + 1] = 128
    out[i + 2] = 0
    out[i + 3] = pixels[i + 3]!
  }

  const regions =
    descriptor.regions && descriptor.regions.length > 0
      ? descriptor.regions
      : [{ x: 0, y: 0, w: width, h: height }]

  for (const region of regions) {
    const resolved = resolveRegion(region, descriptor)
    bakeRegion(pixels, out, width, resolved)
  }

  return out
}

/**
 * Bake a single region into the output buffer. Region-local alpha
 * clamping prevents cross-region gradient bleed.
 */
function bakeRegion(
  pixels: Uint8Array,
  out: Uint8Array,
  width: number,
  region: ResolvedNormalRegion
): void {
  const x0 = region.x
  const y0 = region.y
  const x1 = region.x + region.w
  const y1 = region.y + region.h
  const strength = region.strength
  // Index into the RGBA pixel run for the chosen height source, or -1
  // for 'none'. 0 = R, 1 = G, 2 = B, 3 = A. Luminance needs all three
  // RGB components and is handled separately below.
  const bumpMode = region.bump
  const bumpChannel =
    bumpMode === 'alpha'
      ? 3
      : bumpMode === 'red'
        ? 0
        : bumpMode === 'green'
          ? 1
          : bumpMode === 'blue'
            ? 2
            : -1
  const useLuminance = bumpMode === 'luminance'
  const useBump = bumpChannel >= 0 || useLuminance

  // Build the tilt rotation matrix (+Z → target direction at pitch).
  // For direction angle θ, the tilt axis is perpendicular to the tilt
  // direction in the XY plane: `axis = (-sin θ, cos θ, 0)`.
  // Rodrigues' formula composes the rotation matrix from the axis
  // and `pitch` radians.
  let r00 = 1,
    r01 = 0,
    r02 = 0
  let r10 = 0,
    r11 = 1,
    r12 = 0
  let r20 = 0,
    r21 = 0,
    r22 = 1
  const hasTilt = region.angle !== null
  if (hasTilt) {
    const theta = region.angle as number
    const pitch = region.pitch
    const ax = -Math.sin(theta)
    const ay = Math.cos(theta)
    const c = Math.cos(pitch)
    const s = Math.sin(pitch)
    const t = 1 - c
    // Axis is in the XY plane (az = 0), so several Rodrigues terms drop out.
    r00 = c + ax * ax * t
    r01 = ax * ay * t
    r02 = ay * s
    r10 = ay * ax * t
    r11 = c + ay * ay * t
    r12 = -ax * s
    r20 = -ay * s
    r21 = ax * s
    r22 = c
  }

  // Height sample for the chosen bump mode, clamped to region bounds
  // so adjacent regions (e.g., atlas cells) can't bleed gradients into
  // each other. Returns a value in [0, 1].
  const heightAt = (x: number, y: number): number => {
    const cx = x < x0 ? x0 : x >= x1 ? x1 - 1 : x
    const cy = y < y0 ? y0 : y >= y1 ? y1 - 1 : y
    const base = (cy * width + cx) * 4
    if (useLuminance) {
      // Rec. 709 luminance — matches perceptual brightness, so art
      // authored against a monitor reads consistently.
      return (
        (0.2126 * pixels[base]! +
          0.7152 * pixels[base + 1]! +
          0.0722 * pixels[base + 2]!) /
        255
      )
    }
    return pixels[base + bumpChannel]! / 255
  }

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * width + x) * 4

      // Local tangent-space bump. Central difference on the height
      // source — `heightAt` selects alpha / luminance / a color
      // channel. Standard tangent-space convention: high values are
      // raised, low values are sunken, normal points away from peaks.
      let lx: number
      let ly: number
      let lz: number
      if (useBump) {
        const hL = heightAt(x - 1, y)
        const hR = heightAt(x + 1, y)
        const hD = heightAt(x, y - 1)
        const hU = heightAt(x, y + 1)
        const dx = (hR - hL) * strength
        const dy = (hU - hD) * strength
        lx = -dx
        ly = -dy
        lz = 1
      } else {
        lx = 0
        ly = 0
        lz = 1
      }

      // Apply tilt: n = R · local.
      let nx: number
      let ny: number
      let nz: number
      if (hasTilt) {
        nx = r00 * lx + r01 * ly + r02 * lz
        ny = r10 * lx + r11 * ly + r12 * lz
        nz = r20 * lx + r21 * ly + r22 * lz
      } else {
        nx = lx
        ny = ly
        nz = lz
      }

      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      // Note: nz is not written — runtime reconstructs it as
      // sqrt(1 − nx² − ny²). Outward-facing convention means nz ≥ 0
      // always, so the sign is implicit.

      out[idx] = Math.round((nx * 0.5 + 0.5) * 255)
      out[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      out[idx + 2] = Math.round(region.elevation * 255)
      out[idx + 3] = pixels[idx + 3]!
    }
  }
}

/**
 * Legacy back-compat wrapper. Use `bakeNormalMap(pixels, w, h, {
 * strength })` for equivalent behavior in new code.
 *
 * @deprecated
 */
export function bakeNormalMapFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: BakeOptions = {}
): Uint8Array {
  const strength = options.strength ?? DEFAULT_STRENGTH
  return bakeNormalMap(pixels, width, height, {
    strength,
    bump: DEFAULT_BUMP,
    pitch: DEFAULT_PITCH,
  })
}

/**
 * Derive the conventional `.normal.png` sibling URL for a sprite PNG.
 *
 * Runtime loaders call this to try the baked output before falling
 * back to the runtime TSL path.
 *
 * Pure string rewrite — browser-safe, no filesystem.
 */
export function bakedNormalURL(spriteURL: string): string {
  return spriteURL.replace(/\.png($|[?#])/i, '.normal.png$1')
}
