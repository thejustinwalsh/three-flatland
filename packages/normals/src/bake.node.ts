import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { hashDescriptor } from '@three-flatland/bake'
import { writeSidecarPng } from '@three-flatland/bake/node'
import { bakeNormalMap, type BakeOptions } from './bake.js'
import type { NormalSourceDescriptor } from './descriptor.js'

/**
 * Bake a normal map from a PNG file on disk.
 *
 * Node-only wrapper around `bakeNormalMap` — handles file I/O and
 * stamps the output PNG with a `tEXt` chunk containing the descriptor
 * hash, so `probeBakedSibling` can invalidate stale outputs.
 *
 * Second argument accepts either:
 *   - A full `NormalSourceDescriptor` (region-aware).
 *   - A legacy `BakeOptions` (`{ strength }`) — for back-compat with
 *     existing callers; promoted to a zero-region descriptor.
 *   - A path to a descriptor JSON file.
 */
export function bakeNormalMapFile(
  inputPath: string,
  descriptorOrOptions?: NormalSourceDescriptor | BakeOptions | string,
  outputPath?: string
): string {
  const buffer = readFileSync(inputPath)
  const png = PNG.sync.read(buffer)
  const pixels = new Uint8Array(
    png.data.buffer,
    png.data.byteOffset,
    png.data.byteLength
  )

  const descriptor = resolveDescriptorInput(descriptorOrOptions)
  const normalPixels = bakeNormalMap(pixels, png.width, png.height, descriptor)

  const resolvedOut = outputPath ?? inputPath.replace(/\.png$/i, '.normal.png')
  writeSidecarPng(resolvedOut, normalPixels, png.width, png.height, {
    hash: hashDescriptor(descriptor),
    v: 1,
  })
  return resolvedOut
}

function resolveDescriptorInput(
  input: NormalSourceDescriptor | BakeOptions | string | undefined
): NormalSourceDescriptor {
  if (input === undefined) return {}
  if (typeof input === 'string') {
    const json = readFileSync(input, 'utf8')
    return JSON.parse(json) as NormalSourceDescriptor
  }
  // Heuristic: a BakeOptions has only `strength`; a descriptor may have
  // `regions`, `direction`, etc. Treat as descriptor when any non-
  // `strength` field is present.
  if ('regions' in input || 'direction' in input || 'bump' in input || 'pitch' in input) {
    return input as NormalSourceDescriptor
  }
  const legacy = input as BakeOptions
  return { strength: legacy.strength }
}
