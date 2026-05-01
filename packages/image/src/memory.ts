import type { EncodeFormat, GpuMemoryEstimate } from './types'

export interface SourceShape {
  width: number
  height: number
  alpha: boolean
  format: EncodeFormat
}

const LOADERS = ['three-default', 'three-ktx', 'spark'] as const
type Loader = (typeof LOADERS)[number] | 'all'

export async function estimateGpuMemory(source: SourceShape, loader: Loader): Promise<GpuMemoryEstimate[]> {
  if (loader === 'all') {
    return LOADERS.flatMap((l) => analytic(source, l))
  }
  return analytic(source, loader)
}

function analytic(source: SourceShape, loader: typeof LOADERS[number]): GpuMemoryEstimate[] {
  const px = source.width * source.height
  if (loader === 'three-default') {
    return [{ loader, gpuFormat: 'RGBA8', bytes: px * 4 }]
  }
  if (loader === 'three-ktx') {
    return [{ loader, gpuFormat: source.alpha ? 'BC7' : 'BC1', bytes: px }]
  }
  // spark — analytic fallback (browser layer can promote to measured: true)
  return [{ loader, gpuFormat: source.alpha ? 'BC7' : 'BC1', bytes: px, measured: false }]
}
