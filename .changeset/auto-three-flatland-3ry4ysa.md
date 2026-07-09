---
"three-flatland": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Atlas Schema & Validation

- Relax atlas `meta` requiredness: only `size` is required now, with `anyOf(sources, image)` — raw TexturePacker/Aseprite exports (`meta.image` string, no `meta.sources`) validate again and load correctly (`SpriteSheetLoader` resolves `meta.sources?.[0]?.uri ?? meta.image`)
- Add per-frame polygon fields to `Frame`: baked `mesh` (verts/indices) plus TexturePacker's `vertices`/`verticesUV`/`triangles`, with `mesh` preferred on read
- Fix atlas `meta` subschema structure so `json-schema-to-typescript` codegen no longer collapses `meta.*` fields (including `animations`) to a bare index signature
- Wire `pnpm gen:types:verify` into CI's build/verify step so generated `atlas.types.gen.ts` can't silently drift from `schema.json`
- New `@three-flatland/schemas` package is now the canonical home for the atlas schema + Ajv validator (`validateAtlas`/`assertValidAtlas`/`formatAtlasErrors`), available via `@three-flatland/schemas/atlas`
- `scripts/gen-schema-types.ts` generates and commits self-contained `.gen.ts` type files for `three-flatland` and `tools/io` from schema sources

## Animation Integration

- `SpriteSheet` and `AnimatedSprite2D` can now auto-populate their animation set from atlas-sourced animations (`meta.animations` / Aseprite `frameTags`) via `sheetAnimationsToDefinition()`, when no explicit `animationSet` is given — explicit `animationSet` still takes precedence
- Fix a crash in `new AnimatedSprite2D({})` caused by missing optional chaining on `options.spriteSheet.animations`

## Editor Tooling (VSCode Atlas Tool)

- Atlas editor can now save a `<basename>.atlas.json` sidecar next to the source image (Toolbar Save button or Cmd/Ctrl+S), with a themed status chip showing save progress/result
- Restructured canvas imports, animation drawer/timeline UI, and toolbar primitives for improved responsiveness

## Bundle Size

- Ajv and schema-validation code removed from the `three-flatland` runtime bundle: 56.91 kB → 22.26 kB brotli (-34.65 kB)

## BREAKING CHANGES

- Removed `three-flatland`'s `./sprites/atlas` and `./sprites/atlas.schema.json` subpath exports, and the `ajv` dependency; schema validation (`validateAtlas`, `assertValidAtlas`) has moved to `@three-flatland/schemas/atlas` — update imports accordingly

This release moves atlas schema validation out of the runtime bundle and into a new `@three-flatland/schemas` package, relaxes atlas schema requirements for compatibility with raw TexturePacker/Aseprite exports, adds atlas-driven animation auto-loading to `AnimatedSprite2D`, and lets the VSCode atlas editor save sidecar files directly.
