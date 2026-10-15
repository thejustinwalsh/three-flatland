---
"@three-flatland/slug": minor
---

> Branch: worktree-flpak-binary-format
> PR: https://github.com/thejustinwalsh/three-flatland/pull/91

## New baked-font format: single `.slug.glb`

Baked fonts are now stored as a single standard glTF binary (`.slug.glb`) instead of the previous two-file `.slug.json` + `.slug.bin` pair. All font data (glyphs, cmap, kern, band offsets) lives in standard glTF accessors tagged with the `FL_slug_font` extension.

### Loader

- `SlugFontLoader` fetches and decodes `.slug.glb` at runtime; reconstructs `SlugGlyphData`, cmap, and kern from glTF accessor columns
- Band data sliced from flat `USHORT bandData` accessor via `FLOAT bandOffsets` CSR prefix-sum (word indices)
- Corrupt or truncated `.slug.glb` degrades gracefully to the opentype.js runtime path; `response.arrayBuffer()` failure also falls back
- Schema version gating: `unpackBaked` rejects any `.slug.glb` whose `FL_slug_font` version exceeds the build constant (fail-loud instead of silent misread)

### Baker (`@three-flatland/slug/bake` subpath)

- `packBaked` returns a `Uint8Array` GLB; glyphs sorted by `glyphId` ascending; band offsets use CSR word-index prefix-sum
- `FlSlugFontExtension` exported from `@three-flatland/slug/bake` — register on `NodeIO`/`WebIO` to let glTF-Transform tooling round-trip `.slug.glb` without dropping font data
- All 16-bit writes (band/cmap/kern) validated via `assertUint16`/`assertInt16`; out-of-range values throw instead of silently wrapping
- `@gltf-transform/core` scoped to `./bake` only — browser runtime bundle (`baked.js`, `SlugFontLoader.js`, `index.js`) remains glTF-Transform-free

### CLI (`slug-bake`)

- Bundled for Node ESM so it runs without a tsx shim
- Writes one `.slug.glb` per font; `--output` suffix stripping fixed (no more `MyFont.slug.slug.glb`)
- Windows uses shell to resolve the `tsx.cmd` shim; Unix uses `execFileSync` with an args array

### Validation hardening

- `readGlb`: accessor byte range checked against its declared `bufferView.byteLength` before the BIN-chunk bounds check — catches cross-bufferView spills
- `readGlb`: BIN chunk type and length validated; all accessor views bounds-checked against the BIN chunk; malformed/truncated files throw instead of serving wrong bytes
- `unpackBaked`: kern stride must be exactly 3 (fixed 6-byte records); non-divisible kern accessor length rejected; `glyphs.count` and `kern.stride` guarded against malformed metadata
- `bakedURLs`: preserves query/fragment, strips only the path extension

### Package changes

- `@three-flatland/asset` package removed — GLB loader (`glb.ts`) and `FL_slug_font` extension (`bake.ts`) inlined directly into `@three-flatland/slug`; on-disk layout constants consolidated in `format.ts`
- `@three-flatland/slug` reverted to `bundle:false` to preserve granular subpath exports
- glTF-Validator conformance check added to the bake pipeline

## BREAKING CHANGES

- **Baked font format changed.** `.slug.glb` (single standard glTF binary) replaces the `.slug.json` + `.slug.bin` two-file pair. Re-bake all fonts with `slug-bake`. The `SlugFont` and `SlugFontLoader` public API is unchanged; a missing `.slug.glb` falls back to opentype.js automatically.
- **`@three-flatland/asset` removed.** Any direct imports from `@three-flatland/asset` must be migrated — the GLB reader is now internal to `@three-flatland/slug`.

Reworks `@three-flatland/slug`'s baked-font pipeline around a single standard glTF binary (`.slug.glb`), with robust validation throughout the load and bake paths and `@gltf-transform/core` kept strictly out of the browser runtime bundle.
