import { SlugFontLoader, type SlugFont } from '@three-flatland/slug'
import { Font, type FontInfoSource } from './font.js'

const fontCache = new Map<FontInfoSource, Set<(font: Font) => void> | Font>()

export function loadCachedFont(fontInfoOrUrl: FontInfoSource, onLoad: (font: Font) => void): void {
  const entry = fontCache.get(fontInfoOrUrl)
  if (entry instanceof Set) {
    entry.add(onLoad)
    return
  }
  if (entry != null) {
    onLoad(entry)
    return
  }

  const set = new Set<(font: Font) => void>()
  set.add(onLoad)
  fontCache.set(fontInfoOrUrl, set)

  loadFont(fontInfoOrUrl)
    .then((font) => {
      for (const fn of set) {
        fn(font)
      }
      fontCache.set(fontInfoOrUrl, font)
    })
    .catch(console.error)
}

async function loadFont(fontInfoOrUrl: FontInfoSource): Promise<Font> {
  const resolved = await resolveFontInfoSource(fontInfoOrUrl)
  const slugFont: SlugFont =
    typeof resolved === 'string' ? await SlugFontLoader.load(resolved) : resolved
  return new Font(slugFont)
}

function resolveFontInfoSource(
  fontInfoOrUrl: FontInfoSource
): string | SlugFont | Promise<string | SlugFont> {
  return typeof fontInfoOrUrl === 'function' ? fontInfoOrUrl() : fontInfoOrUrl
}
