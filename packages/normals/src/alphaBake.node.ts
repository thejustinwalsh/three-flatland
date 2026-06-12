import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { bakedSiblingURL, hashDescriptor } from '@three-flatland/bake'
import { writeSidecarPng } from '@three-flatland/bake/node'

/**
 * Versioned descriptor for the alpha sidecar. Parameterless — the hash
 * is constant per format version, so probeBakedSibling staleness only
 * triggers on a `v` bump. Spec §10.
 */
export const ALPHA_DESCRIPTOR = { kind: 'alpha', v: 1 } as const

/**
 * Bake `<input>.alpha.png` from an RGBA PNG: source alpha stored in R
 * (replicated to G/B for grayscale viewability, A=255), stamped with
 * the descriptor hash under the `flatland` tEXt chunk.
 */
export function bakeAlphaMapFile(inputPath: string, outputPath?: string): string {
  const png = PNG.sync.read(readFileSync(inputPath))
  const out = outputPath ?? bakedSiblingURL(inputPath, '.alpha.png')
  const pixels = new Uint8Array(png.width * png.height * 4)
  for (let i = 0; i < png.width * png.height; i++) {
    const a = png.data[i * 4 + 3]!
    pixels[i * 4 + 0] = a
    pixels[i * 4 + 1] = a
    pixels[i * 4 + 2] = a
    pixels[i * 4 + 3] = 255
  }
  writeSidecarPng(out, pixels, png.width, png.height, {
    hash: hashDescriptor(ALPHA_DESCRIPTOR),
    v: 1,
  })
  return out
}
