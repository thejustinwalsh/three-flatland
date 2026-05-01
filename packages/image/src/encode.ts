import type { ImageEncodeOptions } from './types.js'
import { encodePng } from './codecs/png.js'
import { encodeWebp } from './codecs/webp.js'
import { encodeAvif } from './codecs/avif.js'
import { encodeKtx2 } from './codecs/ktx2.js'

export async function encodeImage(pixels: ImageData, opts: ImageEncodeOptions): Promise<Uint8Array> {
  switch (opts.format) {
    case 'png':  return encodePng(pixels)
    case 'webp': return encodeWebp(pixels, { quality: opts.quality, mode: opts.mode })
    case 'avif': return encodeAvif(pixels, { quality: opts.quality, mode: opts.mode })
    case 'ktx2': return encodeKtx2(pixels, opts.basis)
    default:
      throw new Error(`unknown format: ${(opts as { format: string }).format}`)
  }
}
