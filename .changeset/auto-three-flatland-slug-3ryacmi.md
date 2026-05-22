---
"@three-flatland/slug": minor
---

> Branch: worktree-flpak-binary-format
> PR: https://github.com/thejustinwalsh/three-flatland/pull/91

## Baked font format: single `.slug.glb` (glTF)

### New format

- `packBaked` now emits a single `.slug.glb` (standard glTF binary) instead of the old two-file `.slug.json` + `.slug.bin` pair
- All font data stored as native glTF accessors under the `FL_slug_font` extension; glyphs sorted by glyphId ascending, band offsets as CSR word-index prefix-sum
- `bakedURLs` returns a single `.slug.glb` URL; CLI writes one file per font
- `FlSlugFontExtension` published from `@three-flatland/slug/bake` — register on a `NodeIO`/`WebIO` to let glTF-Transform tooling round-trip `.slug.glb` without losing font-data accessors
- `unpackBaked` reconstructs `SlugGlyphData`, cmap, and kern from the glTF accessors; builds curve (`HalfFloatType`) and band (`FloatType`) `DataTexture` objects
- Schema version gate: `unpackBaked` rejects any `.slug.glb` whose `FL_slug_font` version exceeds the build's `SLUG_FONT_VERSION`; writer and reader share the constant

### Architecture

- Bake side (`packBaked`, `FlSlugFontExtension`) moved behind the `@three-flatland/slug/bake` subpath — `@gltf-transform/core` stays out of the browser runtime bundle
- Dropped the `@three-flatland/asset` package (premature shared abstraction, no second consumer); GLB loader (`glb.ts`) and format constants (`format.ts`) inlined directly into slug
- `bundle: false` restored so all granular subpath exports are preserved
- glTF-Validator conformance check added to the bake test suite
- `slug-bake` CLI bundled for Node ESM so it runs without a `tsx` shim

### Robustness fixes

- GLB parser validates BIN chunk type, length, and bounds-checks every accessor view — malformed or truncated `.slug.glb` throws instead of returning views over wrong bytes
- `unpackBaked` rejects a kern accessor whose byte length is not evenly divisible by the stride (kern stride is required to be exactly 3 for fixed 6-byte `kernLookup` records)
- `bake.ts` validates every 16-bit write (`band`/`cmap`/`kern`) via `assertUint16`/`assertInt16` — out-of-range values fail fast instead of silently wrapping
- `bakedURLs` preserves query/fragment and strips only the path extension; double-suffix (`MyFont.slug.slug.glb`) no longer possible from CLI
- `SlugFontLoader`: corrupt or truncated `.slug.glb` is caught and degrades gracefully to the runtime opentype.js path; `response.arrayBuffer()` moved inside `try` so aborted fetches also fall back
- `bake-example-fonts.ts` uses `execFileSync` with an args array (no shell); Windows-only shell flag for `tsx.cmd` shim resolution

## BREAKING CHANGES

**Re-bake required.** Baked fonts are now a single `.slug.glb` file. The old `.slug.json` + `.slug.bin` pair is no longer produced or read. Run `slug-bake` to regenerate any pre-built fonts. The `SlugFont` and `SlugFontLoader` public API is unchanged; a missing `.slug.glb` falls back automatically to the runtime opentype.js path.

The baked font pipeline migrates from a proprietary two-file format to a standard glTF binary container, with glTF-Transform integration for tooling and a schema version gate to catch stale assets at load time.

