---
'@three-flatland/asset': minor
'@three-flatland/slug': minor
---

### `@three-flatland/asset` — initial release

New Layer-0 package: a runtime GLB reader and Node.js glTF-Transform bake helper.

**Runtime (`.` subpath, zero deps)**
- `readAsset(buf)` — zero-copy `FlatlandAsset` reader over a parsed GLB container; `accessor(n)` and `bufferView(n)` return typed-array views sharing the original `ArrayBuffer`
- `readGLB(buf)` — low-level GLB container chunk parser exposing JSON + BIN byte offsets
- `AssetError` — typed error class with `BAD_GLB` / `BAD_ACCESS` codes

**Bake helper (`./bake` subpath, peer-dep `@gltf-transform/core`)**
- `addColumn(doc, buffer, name, typedArray, type)` — create a named glTF accessor from a TypedArray
- `createFLExtension(extensionName)` — factory for a generic `FL_*` root extension holding plain JSON metadata + named accessor references; extension `read()` / `write()` hooks integrate with glTF-Transform `NodeIO`
- `FLProperty` / `FLExtensionInstance` — exported types for downstream bakers

All baked numeric data lives in native glTF accessors (standard `SCALAR`/`VEC*` components with proper `componentType`). A thin `FL_*` extension in the JSON chunk carries metadata and named column indices; no bespoke binary container is used. Future bakers should follow this native-first convention.

### `@three-flatland/slug` — bake to / load from `.slug.glb`

- `packBaked` now emits a single `.slug.glb` (standard GLB) via `@three-flatland/asset`'s `createFLExtension` + `addColumn`. Curve and band texture data are stored as native `FLOAT` / `HALF_FLOAT` accessors under the `FL_slug` root extension; plain JSON metadata (glyph bounds, metrics, advance widths) lives in the extension object.
- `SlugFontLoader` loads the `.slug.glb` path via `readAsset` — zero-copy accessor reads replace the old `ArrayBuffer` split heuristic; no change to the public `SlugFont` API.
- The `slug-bake` CLI now outputs `<name>.slug.glb` (replacing the former `.slug.bin` + `.slug.json` pair). Existing baked files must be re-baked.
