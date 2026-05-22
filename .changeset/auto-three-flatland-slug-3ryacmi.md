---
"@three-flatland/slug": minor
---

> Branch: worktree-flpak-binary-format
> PR: https://github.com/thejustinwalsh/three-flatland/pull/91

## Baked font format: single `.slug.glb` (glTF)

- `packBaked` now produces a single `.slug.glb` (standard glTF binary) replacing the two-file `.slug.json` + `.slug.bin` pair; all glyph, cmap, kern, and band data stored in glTF accessors under the `FL_slug_font` extension
- `bakedURLs` returns a single `.slug.glb` URL; query/fragment preserved, only the path extension stripped
- `slug-bake` CLI writes one `.slug.glb`; `--output` suffix strip handles bare `.slug` input (no more `MyFont.slug.slug.glb`)
- `SlugFontLoader._tryLoadBaked` fetches the `.slug.glb`, unpacks it to `SlugGlyphData`, and builds `HalfFloatType` curve and `FloatType` band `DataTexture`s; a missing or corrupt `.slug.glb` silently falls back to the runtime opentype.js path
- `unpackBaked` reads from a standard `FlatlandAsset`; band data reconstructed from flat USHORT accessor via FLOAT CSR prefix-sum offsets
- Schema-version gate: `unpackBaked` rejects a `.slug.glb` whose `FL_slug_font` version exceeds `SLUG_FONT_VERSION`; writer and reader share the constant
- `kern.stride` validated to be exactly 3 (required by fixed 6-byte `kernLookup` records)
- Example baked assets (`Inter-Regular`, `fa-solid`) regenerated to `.slug.glb` format

## Bake subpath and `FlSlugFontExtension`

- Packer (`packBaked`) and the registerable glTF-Transform extension class `FlSlugFontExtension` moved to the `@three-flatland/slug/bake` subpath, matching the per-format `./bake` convention (precedent: `@three-flatland/normals`)
- `@gltf-transform/core` kept out of the browser runtime graph — only `dist/bake.js` imports it; `dist/index.js`, `dist/baked.js`, and `dist/SlugFontLoader.js` remain glTF-Transform-free
- `FlSlugFontExtension` is registerable on a `NodeIO`/`WebIO` so gltf-transform tooling can round-trip `.slug.glb` files without dropping font-data accessors
- `slug` reverted to `bundle: false` so granular subpath exports are preserved; `slug-bake` CLI bundled separately so it runs under Node ESM

## Removal of `@three-flatland/asset`

- The `@three-flatland/asset` workspace package removed — GLB loader (`glb.ts`) and `FL_slug_font` extension (`bake.ts`) inlined directly into `@three-flatland/slug`; on-disk layout constants single-sourced in `format.ts`
- glTF-Validator conformance check added to the bake pipeline

## Codec hardening

- Every 16-bit write (band/cmap/kern) in `bake.ts` validated via `assertUint16`/`assertInt16` — out-of-range values throw immediately instead of silently wrapping
- `unpackBaked` guards `glyphs.count` and `kern.stride`; floors `kernCount` against malformed metadata
- `response.arrayBuffer()` moved inside the fetch `try` block so truncated/aborted bodies degrade to the runtime path rather than rejecting the load
- `bake-example-fonts.ts` uses `execFileSync` with an args array (no shell); shell mode retained only on Windows for `tsx.cmd` shim resolution

## BREAKING CHANGES

- **Re-bake required**: baked font assets must be regenerated with `slug-bake`. The old two-file `.slug.json` + `.slug.bin` pair is no longer read. Run `slug-bake <font> --output <dir>` to produce the new `.slug.glb`.
- **`@three-flatland/asset` removed**: any direct imports of `@three-flatland/asset` must be migrated. GLB and glTF-Transform functionality is now reachable via `@three-flatland/slug/bake`.
- The `SlugFont` and `SlugFontLoader` public API is unchanged; fonts without a `.slug.glb` continue to load via the runtime opentype.js path.

Migrates the slug baked-font pipeline to a single standard glTF `.slug.glb` file, hardens codec validation throughout, and removes the premature `@three-flatland/asset` abstraction by inlining GLB I/O directly into `@three-flatland/slug`.
