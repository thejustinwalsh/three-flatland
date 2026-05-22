---
"@three-flatland/slug": minor
---

> Branch: worktree-flpak-binary-format
> PR: https://github.com/thejustinwalsh/three-flatland/pull/91

## New baked font format: single `.slug.glb`

### Baked font format

- `slug-bake` now outputs a single `.slug.glb` (standard glTF binary) instead of the old two-file `.slug.json` + `.slug.bin` pair
- All glyph data (curves, bands, cmap, kern) stored in typed glTF accessors under the `FL_slug_font` extension; glyphs sorted by glyphId, band offsets use CSR word-index prefix-sum
- `bakedURLs` returns a single `.slug.glb` URL; the `./bake` subpath handles packing, the runtime stays glTF-Transform-free
- `SlugFontLoader` reads the `.slug.glb` directly — fetches the file, unpacks glyph data, and builds curve (`HalfFloatType`) and band (`FloatType`) DataTextures; an absent or corrupt `.slug.glb` falls back to the runtime opentype.js path transparently
- Schema version guard: `unpackBaked` rejects a `.slug.glb` whose `FL_slug_font` version exceeds `SLUG_FONT_VERSION`; writer and reader share the constant so version mismatches fail loudly

### `@three-flatland/slug/bake` subpath

- Baker code (`packBaked`, `FlSlugFontExtension`) moved to the `@three-flatland/slug/bake` subpath, following the same convention as `@three-flatland/normals`
- `FlSlugFontExtension` is a registerable glTF-Transform extension class; register it on a `NodeIO`/`WebIO` to read and round-trip `.slug.glb` files with gltf-transform tooling
- `@gltf-transform/core` is a dependency reachable only via the `./bake` subpath — absent from the browser runtime bundle

### Removed `@three-flatland/asset` package

- The separate `@three-flatland/asset` package has been removed; its GLB loader and glTF extension code is now inlined directly into `@three-flatland/slug`
- On-disk layout constants single-sourced in `format.ts`; a glTF-Validator conformance check is run on baked output

### CLI and codec hardening

- `slug-bake` CLI bundled correctly for Node ESM; example fonts re-baked to `.slug.glb`
- `--output` suffix stripping handles bare `.slug` input (no more `MyFont.slug.slug.glb` double-suffix)
- 16-bit writes in the baker (`band`, `cmap`, `kern`) validated via `assertUint16`/`assertInt16` — out-of-range values throw immediately instead of silently wrapping
- `bakedURLs` preserves URL query and fragment, strips only the path extension
- `unpackBaked` guards `glyphs.count` and `kern.stride`, floors `kernCount` against malformed metadata

## BREAKING CHANGES

**Re-bake required.** The `.slug.json` + `.slug.bin` two-file format is replaced by a single `.slug.glb`. Run `slug-bake` on all fonts to regenerate baked assets. The `SlugFont` and `SlugFontLoader` public API is unchanged; missing `.slug.glb` files fall back to the runtime opentype.js path automatically.

**`@three-flatland/asset` removed.** If you depended on `@three-flatland/asset` directly, inline the GLB/glTF-Transform logic from `@three-flatland/slug/bake` or vendor it yourself.

Rewrites `@three-flatland/slug`'s baked-font pipeline around a single standard `.slug.glb` glTF file, moving all tool-side code behind the `./bake` subpath and hardening the codec against malformed inputs and version mismatches.
