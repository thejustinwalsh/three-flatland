import { bakedSiblingURL, hashDescriptor, probeBakedSibling } from '@three-flatland/bake'
import { AlphaMap } from './AlphaMap'

// Types the build-time `process.env` read without requiring @types/node.
declare const process: { env: { NODE_ENV?: string } }

/** Must stay in lockstep with ALPHA_DESCRIPTOR in @three-flatland/alphamap. */
export const ALPHA_SIDECAR_DESCRIPTOR = { kind: 'alpha', v: 1 } as const

export interface ResolveAlphaMapOptions {
  /** Skip the sidecar probe and always extract at runtime. */
  forceRuntime?: boolean
  /**
   * Runtime extraction strategy. The SpriteSheetLoader passes a
   * texture-readback closure; injectable here for testing and for
   * worker-based readback later.
   */
  runtimeFallback: () => Promise<AlphaMap | null>
}

/** Build an AlphaMap from decoded RGBA pixels (alpha lives in R). */
export function decodeAlphaPng(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): AlphaMap {
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4] ?? 0
  return new AlphaMap(alpha, width, height)
}

/**
 * Resolve an alpha hitmask for a source image URL: probe the baked
 * `.alpha.png` sibling (hash-stamped — see flatland-bake alpha), load
 * it on a match, otherwise fall back to runtime extraction with a
 * devtime warning. Mirrors resolveNormalMap. Spec §10.
 */
export async function resolveAlphaMap(sourceURL: string, options: ResolveAlphaMapOptions): Promise<AlphaMap | null> {
  if (!options.forceRuntime) {
    const bakedURL = bakedSiblingURL(sourceURL, '.alpha.png')
    const probe = await probeBakedSibling(bakedURL, {
      expectedHash: hashDescriptor(ALPHA_SIDECAR_DESCRIPTOR),
    })
    if (probe.ok && probe.hashMatches) {
      try {
        const response = await fetch(bakedURL)
        if (!response.ok) throw new Error(`resolveAlphaMap: fetch ${bakedURL} → ${response.status}`)
        const bitmap = await createImageBitmap(await response.blob())
        let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
        if (typeof OffscreenCanvas !== 'undefined') {
          ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')
        } else {
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          ctx = canvas.getContext('2d')
        }
        if (!ctx) throw new Error('resolveAlphaMap: 2D canvas context unavailable')
        ctx.drawImage(bitmap as CanvasImageSource, 0, 0)
        const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
        return decodeAlphaPng(data, width, height)
      } catch {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `three-flatland: failed to decode baked alpha sidecar for ${sourceURL} — falling back to runtime extraction`
          )
        }
        // fall through to runtimeFallback below
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        probe.ok
          ? `three-flatland: stale alpha sidecar for ${sourceURL} — re-run \`flatland-bake alpha\``
          : `three-flatland: no baked alpha sidecar for ${sourceURL} — extracting at runtime. ` +
              `Run \`flatland-bake alpha\` to precompute.`
      )
    }
  }
  return options.runtimeFallback()
}
