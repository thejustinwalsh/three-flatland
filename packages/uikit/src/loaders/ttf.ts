import { Loader } from 'three'
import type { LoadingManager } from 'three'

// STUB: ported in U1/U2. Upstream generates a runtime MSDF atlas via
// `@zappar/msdf-generator`; the fork drops MSDF entirely and loads TTF/OTF through
// `@three-flatland/slug`'s `SlugFontLoader` instead (spec §8.1/§8.2). The dependency on
// `@zappar/msdf-generator` is dropped, so `MSDFResult` is now a structurally-empty
// placeholder shape rather than re-exporting the upstream generator's result type.

export type MSDFResult = Record<string, never>

export interface TTFLoaderOptions {
  url?: string
  onProgress?: (progress: number, completed: number, total: number) => void
}

export type TTFInputItem = string | (TTFLoaderOptions & { url: string })
export type TTFInput = string | TTFInputItem[]

export class TTFLoader extends Loader<MSDFResult, TTFInput> {
  constructor(manager?: LoadingManager) {
    super(manager)
  }

  override load(
    _input: TTFInput,
    _onLoad: (data: MSDFResult) => void,
    _onProgress?: (event: ProgressEvent) => void,
    _onError?: (err: unknown) => void
  ): void {
    throw new Error('ported in U1/U2')
  }

  override loadAsync(
    _input: TTFInput,
    _onProgress?: (event: ProgressEvent) => void
  ): Promise<MSDFResult> {
    throw new Error('ported in U1/U2')
  }
}
