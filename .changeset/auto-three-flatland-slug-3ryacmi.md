---
"@three-flatland/slug": minor
---

> Branch: worktree-flpak-binary-format
> PR: https://github.com/thejustinwalsh/three-flatland/pull/91

## New binary format: `.slug.glb`

- `packBaked` now produces a single `.slug.glb` (standard glTF binary) instead of the old `.slug.json` + `.slug.bin` pair; all font data lives in named glTF accessors under the `FL_slug_font` extension
- `unpackBaked` reads the single `.slug.glb`, reconstructing glyph SoA, cmap, kern, and band data from accessor columns; CSR prefix-sum word indices used for band slice addressing
- `SlugFontLoader._tryLoadBaked` fetches one `.slug.glb`, calls `readAsset` + `unpackBaked`, and builds `HalfFloatType` curve and `FloatType` band `DataTexture`s
- `bakedURLs` returns a single `.slug.glb` URL; `slug-bake` CLI writes one file per font
- Schema version (`SLUG_FONT_VERSION = 1`) shared between writer and reader; `unpackBaked` throws loudly if the file's version exceeds the build's supported version
- On-disk layout (`SLUG_EXTENSION_NAME`, `SLUG_FONT_VERSION`, `SLUG_COLUMNS`) single-sourced in `format.ts` so baker and reader cannot drift
- Example font assets for `slug-text` (React + Three.js) rebaked to `.slug.glb`

## Package restructuring

- `@three-flatland/slug/bake` subpath now exports `packBaked` and `FlSlugFontExtension` (the registerable glTF-Transform extension); follows the `./bake` convention established by `@three-flatland/normals`
- `FlSlugFontExtension` can be registered on a `NodeIO`/`WebIO` so gltf-transform tooling round-trips `.slug.glb` without losing font-data accessors
- Runtime graph (`dist/baked.js`, `dist/SlugFontLoader.js`, `dist/index.js`) is now `@gltf-transform/core`-free; only `dist/bake.js` pulls it in
- `@gltf-transform/core` promoted from `devDependencies` to `dependencies` (reachable via `./bake` only)
- Removed the `@three-flatland/asset` workspace package — inlined its GLB loader (`glb.ts`) and `FL_slug_font` extension code directly into `@three-flatland/slug`; no second consumer existed to justify the abstraction
- `slug` reverted to `bundle: false` so all granular subpath exports are preserved
- `slug-bake` CLI bundled as a proper Node ESM bundle so it runs without resolution issues
- Added glTF-Validator conformance check for baked output

## BREAKING CHANGES

Baked font files have changed format. The old two-file `.slug.json` + `.slug.bin` pair is no longer produced or read. Re-bake all fonts using `slug-bake`; the resulting `.slug.glb` replaces both old files. The public `SlugFont` and `SlugFontLoader` API is unchanged — an absent `.slug.glb` falls back to the runtime opentype.js path automatically.

The `@three-flatland/asset` package is removed. Any direct imports from `@three-flatland/asset` must be replaced with the equivalent imports from `@three-flatland/slug` (runtime) or `@three-flatland/slug/bake` (bake-time).

`@three-flatland/slug` baked fonts migrate from a two-file pair to a single standard glTF binary; re-baking is required. Runtime and loader APIs are otherwise unchanged.
