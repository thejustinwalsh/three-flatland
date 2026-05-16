import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  TextureLoader as ThreeTextureLoader,
  type Texture,
} from 'three'
import {
  bakedSiblingURL,
  devtimeWarn,
  hashDescriptor,
  probeBakedSibling,
} from '@three-flatland/bake'
import type { NormalSourceDescriptor } from './descriptor.js'

export interface ResolveNormalMapOptions {
  /**
   * Skip the baked-sibling probe and go straight to the in-memory bake.
   * Suppresses both the HEAD round-trip and the "no baked sibling"
   * devtime warning — for when you know no sidecar is shipped yet and
   * don't want the 404 noise on every load.
   *
   * Mirrors the `forceRuntime` flag on `SlugFontLoader` and every other
   * baked-asset loader in the codebase.
   */
  forceRuntime?: boolean
  /**
   * Force the returned texture's `flipY` to this value. Pass the
   * diffuse texture's `flipY` so the normal map samples 1:1 with the
   * diffuse on the GPU regardless of whether the normal came from the
   * image-loader path (default true) or the in-memory `DataTexture`
   * path (default false).
   */
  flipY?: boolean
}

/**
 * Resolve the normal map for an asset URL + descriptor.
 *
 * 1. Hash the descriptor.
 * 2. Probe the baked sibling `<source>.normal.png` (unless
 *    `forceRuntime`). If present and its stamped hash matches, load
 *    and return that texture directly.
 * 3. On miss (or stale hash), fetch the source, decode its pixels,
 *    lazy-import + run `bakeNormalMap` in memory, and wrap the result
 *    in a `DataTexture`. Runtime bake is the always-on fallback when
 *    normals were requested.
 *
 * Browser-only — uses `fetch`, `createImageBitmap`, `OffscreenCanvas`.
 * Safe to call from any Three.js loader runtime.
 */
export async function resolveNormalMap(
  sourceURL: string,
  descriptor: NormalSourceDescriptor,
  options: ResolveNormalMapOptions = {}
): Promise<Texture> {
  const hash = hashDescriptor(descriptor)

  if (!options.forceRuntime) {
    const bakedURL = bakedSiblingURL(sourceURL, '.normal.png')
    const probe = await probeBakedSibling(bakedURL, { expectedHash: hash })
    if (probe.ok && probe.hashMatches) {
      const tex = await loadTextureURL(bakedURL)
      if (options.flipY !== undefined) tex.flipY = options.flipY
      tex.needsUpdate = true
      return tex
    }
    if (probe.ok && !probe.hashMatches) {
      devtimeWarn(
        'normal',
        sourceURL,
        `${bakedURL} exists but its descriptor hash is stale — re-baking in memory. ` +
          `Run \`npx flatland-bake normal ${sourceURL} --descriptor <descriptor>.json\` to refresh.`
      )
    } else {
      devtimeWarn(
        'normal',
        sourceURL,
        `No baked sibling at ${bakedURL} — baking in memory. ` +
          `Run \`npx flatland-bake normal\` for production, or set \`forceRuntime: true\` to skip the probe.`
      )
    }
  }

  const tex = await bakeInMemory(sourceURL, descriptor)
  if (options.flipY !== undefined) tex.flipY = options.flipY
  tex.needsUpdate = true
  return tex
}

// ─── Private ──────────────────────────────────────────────────────────────

async function loadTextureURL(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const loader = new ThreeTextureLoader()
    loader.load(
      url,
      (tex) => resolve(tex as Texture),
      undefined,
      (err) => reject(err as Error)
    )
  })
}

async function bakeInMemory(
  sourceURL: string,
  descriptor: NormalSourceDescriptor
): Promise<Texture> {
  const res = await fetch(sourceURL)
  if (!res.ok) {
    throw new Error(`resolveNormalMap: failed to fetch ${sourceURL} (${res.status})`)
  }
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap
  const pixels = imageBitmapToRGBA(bitmap, width, height)
  bitmap.close()

  const { bakeNormalMap } = await import('./bake.js')
  const normalPixels = bakeNormalMap(pixels, width, height, descriptor)
  const texture = new DataTexture(
    normalPixels,
    width,
    height,
    RGBAFormat,
    UnsignedByteType
  )
  texture.needsUpdate = true
  return texture
}

function imageBitmapToRGBA(
  bitmap: ImageBitmap,
  width: number,
  height: number
): Uint8Array {
  // OffscreenCanvas where available (workers + modern browsers), fall
  // back to a regular 2D canvas in environments that don't ship it.
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('resolveNormalMap: OffscreenCanvas 2D context unavailable')
    ctx.drawImage(bitmap, 0, 0)
    const data = ctx.getImageData(0, 0, width, height)
    return new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('resolveNormalMap: Canvas 2D context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, width, height)
  return new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength)
}

