import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

export interface BakeOptions {
  /** Scales the alpha gradient before normalization. Default 1. */
  strength?: number
}

/**
 * Produce a tangent-space normal map from a sprite's alpha channel.
 *
 * Mirrors the runtime TSL helper `normalFromSprite` from @three-flatland/nodes,
 * run offline so lit sprites do not pay the four alpha samples + gradient per
 * fragment at render time.
 *
 * Algorithm:
 *   dx = (alpha[+1,0] - alpha[-1,0]) * strength
 *   dy = (alpha[0,+1] - alpha[0,-1]) * strength
 *   normal = normalize(vec3(-dx, -dy, 1))
 *   rgb = normal * 0.5 + 0.5
 *
 * Borders clamp to edge so sprites without transparent padding stay stable.
 *
 * @param pixels RGBA pixel buffer, row-major, 4 bytes per pixel.
 * @param width  Pixel width.
 * @param height Pixel height.
 * @param options Tuning knobs.
 * @returns RGBA pixel buffer containing the encoded normal map. Alpha copied
 *          from the source so the baked map carries its own silhouette.
 */
export function bakeNormalMapFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: BakeOptions = {}
): Uint8Array {
  const strength = options.strength ?? 1
  const out = new Uint8Array(pixels.length)

  const alphaAt = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y
    return pixels[(cy * width + cx) * 4 + 3]! / 255
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4

      const aL = alphaAt(x - 1, y)
      const aR = alphaAt(x + 1, y)
      const aD = alphaAt(x, y - 1)
      const aU = alphaAt(x, y + 1)

      const dx = (aR - aL) * strength
      const dy = (aU - aD) * strength

      let nx = -dx
      let ny = -dy
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len

      out[idx] = Math.round((nx * 0.5 + 0.5) * 255)
      out[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      out[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255)
      out[idx + 3] = pixels[idx + 3]!
    }
  }

  return out
}

/**
 * Bake a normal map from a PNG file on disk.
 *
 * `input` must point to an RGBA PNG (alpha drives the gradient). `output`
 * defaults to the sibling `<input basename>.normal.png`.
 */
export function bakeNormalMapFile(
  inputPath: string,
  outputPath?: string,
  options: BakeOptions = {}
): string {
  const buffer = readFileSync(inputPath)
  const png = PNG.sync.read(buffer)
  const pixels = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength)

  const normalPixels = bakeNormalMapFromPixels(pixels, png.width, png.height, options)

  const outPng = new PNG({ width: png.width, height: png.height })
  outPng.data = Buffer.from(normalPixels.buffer, normalPixels.byteOffset, normalPixels.byteLength)
  const outBuffer = PNG.sync.write(outPng)

  const resolvedOut = outputPath ?? inputPath.replace(/\.png$/i, '.normal.png')
  writeFileSync(resolvedOut, outBuffer)
  return resolvedOut
}

/**
 * Derive the conventional `.normal.png` sibling URL for a sprite PNG.
 *
 * Runtime loaders call this to try the baked output before falling back to
 * the runtime TSL path.
 */
export function bakedNormalURL(spriteURL: string): string {
  return spriteURL.replace(/\.png($|\?)/i, '.normal.png$1')
}
