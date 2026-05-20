---
'@three-flatland/asset': minor
'@three-flatland/slug': major
---

### `@three-flatland/slug` — **BREAKING:** baked fonts are now a single `.slug.glb`

**This is a breaking change to the baked-font format. You MUST re-bake any fonts you previously baked.**

Slug no longer emits or loads the `{name}.slug.json` + `{name}.slug.bin` pair. A baked font is now a **single standard GLB** file, `{name}.slug.glb`, that contains both the JSON manifest and the binary buffers in one file (one fetch instead of two).

**Migration**
- Re-bake every font: `slug-bake <font>.ttf` now writes `<font>.slug.glb`. Delete the old `.slug.json` / `.slug.bin` files — they are no longer read.
- No runtime API change: `SlugFontLoader.load('/font.ttf')` (and the R3F `useLoader(SlugFontLoader, …)` path) is unchanged; it now derives and fetches `/font.slug.glb`. If a `.slug.glb` is absent it falls back to the runtime (opentype.js) path as before.
- The public `SlugFont` API is unchanged.

**What changed**
- `packBaked` emits a single `.slug.glb` via `@three-flatland/asset` (`createFLExtension` + `addColumn`). Glyph columns, cmap, kern, and the ragged band data are native glTF accessors; the curve texture is a `USHORT` accessor (half-float bits) and the band texture a `FLOAT` accessor; metrics/strokeSets/texture dims and the accessor index map live in the `FL_slug_font` root extension (JSON chunk).
- `SlugFontLoader` reads the `.slug.glb` via `readAsset` — zero-copy accessor views replace the old two-file split.
- The format carries a `version` field in `FL_slug_font` (`SLUG_FONT_VERSION`). `unpackBaked` **gates** on it: a `.slug.glb` baked with a newer schema version than the running build supports is rejected with a clear error rather than silently misread. Additive schema changes keep the version; only layout-incompatible changes bump it.

### `@three-flatland/asset` — initial release

New Layer-0 package: a runtime GLB reader and Node.js glTF-Transform bake helper.

**Runtime (`.` subpath, zero deps)**
- `readAsset(buf)` — zero-copy `FlatlandAsset` reader over a parsed GLB container; `accessor(n)` and `bufferView(n)` return typed-array views sharing the original `ArrayBuffer`; `ext(name)` returns a root extension object.
- `readGLB(buf)` — low-level GLB container chunk parser exposing JSON + BIN byte offsets.
- `AssetError` — typed error class with `BAD_GLB` / `BAD_ACCESS` codes.

**Bake helper (`./bake` subpath, peer-dep `@gltf-transform/core`)**
- `addColumn(doc, buffer, name, typedArray, type)` — create a named glTF accessor from a TypedArray.
- `createFLExtension(extensionName)` — factory for a generic `FL_*` root extension holding plain JSON metadata + named accessor references; `read()` / `write()` hooks integrate with glTF-Transform `NodeIO`.

All baked numeric data lives in native glTF accessors (standard `SCALAR`/`VEC*` components with proper `componentType`). A thin `FL_*` extension in the JSON chunk carries metadata and named column indices; no bespoke binary container is used. Baked output passes the official Khronos glTF-Validator with zero errors. Future bakers should follow this native-first convention.
