// Decode a KTX2 file's top-mip pixel data to an `ImageData`. Used by
// the encode-mode bridge handler when the right-click "Open Image
// Encoder" command is invoked on a `.ktx2` file: the source artifact
// must round-trip to RGBA on the CPU before the encode pipeline can
// re-encode it to a different format.
//
// We force the basis transcoder to its `cTFRGBA32` fallback by passing
// all-false capabilities to a dedicated `Ktx2Loader` instance. The
// resulting `DataTexture`'s `mipmaps[0].data` is a flat Uint8Array of
// `width * height * 4` RGBA bytes, stored bottom-up (OpenGL origin
// convention) — we vertical-flip the rows on the way into ImageData
// since image consumers expect top-down rows.

import type { Ktx2Loader as Ktx2LoaderType } from '@three-flatland/image/loaders/ktx2'

const ALL_FALSE_CAPS = {
  astcSupported: false,
  astcHDRSupported: false,
  etc1Supported: false,
  etc2Supported: false,
  dxtSupported: false,
  bptcSupported: false,
  pvrtcSupported: false,
} as const

let loaderPromise: Promise<Ktx2LoaderType> | null = null

async function getDecodeLoader(): Promise<Ktx2LoaderType> {
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const { Ktx2Loader } = await import('@three-flatland/image/loaders/ktx2')
      return new Ktx2Loader().setSupportedFormats(ALL_FALSE_CAPS)
    })()
  }
  return loaderPromise
}

export async function decodeKtx2ToImageData(bytes: Uint8Array): Promise<ImageData> {
  const loader = await getDecodeLoader()
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const tex = (await loader.parse(buf)) as {
    mipmaps?: { width: number; height: number; data: Uint8Array }[]
  }
  const m0 = tex.mipmaps?.[0]
  if (!m0) throw new Error('decodeKtx2ToImageData: no mip-0 in transcoded texture')
  const { width, height, data } = m0
  if (data.length !== width * height * 4) {
    throw new Error(
      `decodeKtx2ToImageData: expected ${width * height * 4} bytes (RGBA32), got ${data.length}`,
    )
  }
  // KTX2 stores image data bottom-up; ImageData expects top-down rows.
  const stride = width * 4
  const flipped = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    const srcOff = (height - 1 - y) * stride
    const dstOff = y * stride
    flipped.set(data.subarray(srcOff, srcOff + stride), dstOff)
  }
  return new ImageData(flipped, width, height)
}
