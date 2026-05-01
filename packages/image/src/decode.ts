import type { EncodeFormat } from './types'
import { decodePng } from './codecs/png'
import { decodeWebp } from './codecs/webp'
import { decodeAvif } from './codecs/avif'

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
