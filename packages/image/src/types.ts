export type EncodeFormat = 'png' | 'webp' | 'avif' | 'ktx2'

export interface ImageEncodeOptions {
  format: EncodeFormat
  quality?: number
  mode?: 'lossy' | 'lossless'
  basis?: {
    mode?: 'etc1s' | 'uastc'
    mipmaps?: boolean
    uastcLevel?: 0 | 1 | 2 | 3 | 4
    /** KTX2 supercompression for UASTC. Default 'zstd' (~20-30% smaller
     *  than raw UASTC at the same quality). Set to 'none' to opt out.
     *  Ignored for ETC1S. */
    supercompression?: 'none' | 'zstd'
  }
  alpha?: boolean
}

export interface GpuMemoryEstimate {
  loader: 'three-default' | 'three-ktx' | 'spark'
  gpuFormat: string
  bytes: number
  mipBytes?: number
  measured?: boolean
}
