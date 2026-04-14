---
"@three-flatland/slug": minor
---

> Branch: feat-slug
> PR: https://github.com/thejustinwalsh/three-flatland/pull/20

**New APIs**

- `SlugText` — WebGPU analytic text mesh with font, text, alignment, word wrap, line height, and color options
- `SlugFont` / `SlugFontLoader` — font loading supporting both baked (`.slug.bin`/`.slug.json`) and runtime (`.ttf`/`.otf` via opentype.js) paths
- `SlugFont.wrapText(text, fontSize, maxWidth?)` — wrap text using Slug's shaped advances so line breaks match rendered output
- `SlugFont.measureText(text, fontSize)` — single-line `TextMetrics` aligned with `CanvasRenderingContext2D.measureText`
- `SlugFont.measureParagraph(text, fontSize, { maxWidth?, lineHeight? })` — multi-line `ParagraphMetrics` respecting Slug's 1.2 line-height default
- `SlugFont.hasCharCode(c)` — codepoint coverage check
- `SlugFontStack(fonts)` — ordered per-codepoint fallback chain; `resolveCodepoint`, `resolveText`, `wrapText`
- `SlugStackText` — multi-font renderable backed by one `InstancedMesh` per contributing font
- `SlugStrokeMaterial` — analytic outline NodeMaterial with runtime-uniform `strokeHalfWidth`, `color`, and `opacity`
- `SlugText.outline` — opt-in child `InstancedMesh` for outlined text, sharing fill geometry (no instance-data copy)
- `SlugText.setOutlineWidth(v)` / `setOutlineColor(c)` / `setOpacity(v)` — zero-rebuild runtime-uniform setters
- `SlugOutlineOptions` exported from the package root
- `StyleSpan { start, end, underline?, strike? }` — character-range text decorations
- `SlugText.styles` — runtime setter for `StyleSpan[]`; underline and strikethrough rendered in the same draw call via rect sentinels
- `slug-bake` CLI — bakes a TTF/OTF to `.slug.bin` + `.slug.json`; gained `--output / -o` for custom output paths

**Performance**

- GPU texture bandwidth reduced ~50%: `curveTexture` → RGBA16F, `bandTexture` → RG32F
- `bandCount` doubled (8 → 16), cutting expected curves per band by ~50% and per-fragment ALU proportionally
- Shader skips the solve+coverage path for ~30% of non-crossing curves per band
- `MAX_CURVES_PER_BAND` tightened 64 → 40 (covers Inter's full glyph corpus at p999), reducing register pressure
- Stroke shader reduced to one Newton seed (plus two endpoint candidates), halving WGSL size and first-use compile time, cutting per-fragment cost ~⅔
- `SlugText._setFont` no longer rebuilds the outline mesh unless outline is already enabled

**Bug fixes**

- Outline quad expansion is now axis-aligned per axis, fixing the clipped/squared-off stroke corners at glyph extents
- `SlugText._setFont` no longer sets `visible = true` before the first `_rebuild`, fixing blank WebGPU canvas on R3F's first render pass
- Runtime shapers now pass `{ features: [] }` to `stringToGlyphs`, suppressing `liga`/`rlig` token deletion that caused whitespace collapse at wrap points
- `parseFont` emits advance-only glyph entries for cmap'd glyphs with no outline (space, tab, zero-width controls), aligning runtime and baked advance resolution
- Baked `measureText` uses bounds-area gating instead of `curves.length > 0`, fixing zero ink bounds for every glyph on the baked path

**BREAKING CHANGES**

- Baked font format has been updated. Re-bake all `.slug.bin`/`.slug.json` files with the latest `slug-bake` CLI before upgrading.

Initial release of `@three-flatland/slug`: WebGPU analytic text rendering with baked and runtime font support, multi-font fallback stacks, text measurement, underline/strikethrough decorations, analytic stroke outlines with runtime-uniform width and color, and stem-darkening hinting.
