import { Loader } from 'three'
import type { LoadingManager } from 'three'
import { SlugFontLoader, SlugFontStack } from '@three-flatland/slug'
import type { SlugFont } from '@three-flatland/slug'

// Upstream generated a runtime MSDF atlas via `@zappar/msdf-generator`; the fork drops
// MSDF entirely and loads TTF/OTF through `@three-flatland/slug`'s `SlugFontLoader`
// instead (spec §8.1/§8.2). The `MSDFResult` name is kept (it is public API, exported
// from both `loaders/index.ts` and `react/use-ttf.tsx`) even though nothing here is
// MSDF anymore — renaming it is a wider API break than this unit's scope.
//
// A single URL resolves to one `SlugFont`. An array of items resolves to a
// `SlugFontStack` (Slug's per-codepoint fallback chain) — the real analogue of
// upstream's multi-item TTF merging. NOTE: uikit's `fontFamilies`/`Text` pathway
// (`text/font.ts`) only accepts a single `SlugFont` per weight today — rendering a
// `SlugFontStack` through uikit's component tree is out of this unit's scope.
// `useTTF`/`TTFLoader`'s stack result is an escape hatch for direct `SlugText`/
// `SlugStackText` consumers, not (yet) a supported `fontFamilies` value.
export type MSDFResult = SlugFont | SlugFontStack

export interface TTFLoaderOptions {
  url?: string
  onProgress?: (progress: number, completed: number, total: number) => void
}

export type TTFInputItem = string | (TTFLoaderOptions & { url: string })
export type TTFInput = string | TTFInputItem[]

function itemURL(item: TTFInputItem): string {
  return typeof item === 'string' ? item : item.url
}

// Neither `TTFLoaderOptions.onProgress` (per-item) nor the `Loader` base's
// `ProgressEvent`-based `onProgress` fire here — `SlugFontLoader` doesn't report
// byte-level fetch progress, and faking one would be worse than reporting none.
export class TTFLoader extends Loader<MSDFResult, TTFInput> {
  constructor(manager?: LoadingManager) {
    super(manager)
  }

  override load(
    input: TTFInput,
    onLoad: (data: MSDFResult) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ): void {
    this.loadAsync(input).then(onLoad, (err) => {
      if (onError) {
        onError(err)
      } else {
        console.error('TTFLoader:', err)
      }
    })
  }

  override async loadAsync(
    input: TTFInput,
    _onProgress?: (event: ProgressEvent) => void
  ): Promise<MSDFResult> {
    const items = Array.isArray(input) ? input : [input]
    const fonts = await Promise.all(
      items.map((item) => SlugFontLoader.load(this.manager.resolveURL(itemURL(item))))
    )
    return fonts.length === 1 ? fonts[0]! : new SlugFontStack(fonts)
  }
}
