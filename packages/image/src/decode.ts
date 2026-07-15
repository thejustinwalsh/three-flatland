import type { EncodeFormat } from './types.js'
import { decodePng } from './codecs/png.js'
import { decodeWebp } from './codecs/webp.js'
import { decodeAvif } from './codecs/avif.js'

export async function decodeImage(bytes: Uint8Array, format: EncodeFormat): Promise<ImageData> {
  switch (format) {
    case 'png':  return decodePng(bytes)
    case 'webp': return decodeWebp(bytes)
    case 'avif': return decodeAvif(bytes)
    case 'ktx2':
      throw new Error('KTX2 decode is not supported in this package — use three.js KTX2Loader at runtime')
    default:
      throw new Error(`unknown format: ${format as string}`)
  }
}
