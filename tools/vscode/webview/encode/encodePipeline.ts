import { encodeImage, decodeImage, type ImageEncodeOptions } from '@three-flatland/image'
import { useEncodeStore } from './encodeStore'

let timer: ReturnType<typeof setTimeout> | null = null

function buildOpts(state: ReturnType<typeof useEncodeStore.getState>): ImageEncodeOptions {
  switch (state.format) {
    case 'webp':
      return { format: 'webp', quality: state.webp.quality }
    case 'avif':
      return { format: 'avif', quality: state.avif.quality }
    case 'ktx2':
      return {
        format: 'ktx2',
        basis: {
          mode: state.ktx2.mode,
          mipmaps: state.ktx2.mipmaps,
          uastcLevel: state.ktx2.uastcLevel,
        },
      }
  }
}

async function runEncode(): Promise<void> {
  const state = useEncodeStore.getState()
  if (!state.sourceImage) return
  const reqId = state.bumpEncodeReqId()
  state.setRuntimeFields({ isEncoding: true, encodeError: null })

  try {
    const opts = buildOpts(state)
    const encoded = await encodeImage(state.sourceImage, opts)
    if (useEncodeStore.getState().encodeReqId !== reqId) return
    // KTX2 decode is NOT supported by @three-flatland/image (it throws).
    // For visual preview we skip the decode for KTX2; EncodedView will show a
    // placeholder noting that runtime decoding is via three.js KTX2Loader.
    let decoded: ImageData | null = null
    if (opts.format !== 'ktx2') {
      decoded = await decodeImage(encoded, opts.format)
      if (useEncodeStore.getState().encodeReqId !== reqId) return
    }
    // Pair the bytes with the format that produced them. Consumers (the
    // texture-decode hook in ComparePreview) MUST read encodedFormat —
    // not the doc-slice `format` — because the user can flip format
    // mid-encode and we'd otherwise hand stale-format bytes to the wrong
    // decoder (e.g., WebP bytes to KTX2Loader → "Missing KTX 2.0
    // identifier").
    state.setRuntimeFields({
      encodedBytes: encoded,
      encodedFormat: opts.format,
      encodedImage: decoded,
      encodedSize: encoded.length,
      isEncoding: false,
    })
  } catch (err) {
    if (useEncodeStore.getState().encodeReqId !== reqId) return
    const msg = err instanceof Error ? err.message : String(err)
    state.setRuntimeFields({ isEncoding: false, encodeError: msg })
  }
}

export function scheduleEncode(delayMs = 250): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    void runEncode()
  }, delayMs)
}
