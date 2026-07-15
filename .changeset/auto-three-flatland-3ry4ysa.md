---
"three-flatland": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Atlas schema & sprite-sheet loader

- Added `atlas.schema.json` (JSON Schema) for the sprite-atlas sidecar format, superset of TexturePacker's JSON-Hash format, with additive `meta.app`/`meta.version`/`meta.sources`/`meta.normal`/`meta.animations` fields
- Added atlas sidecar save from the VSCode atlas editor (`<basename>.atlas.json`), with dedupe-safe frame naming, Cmd/Ctrl+S support, and a themed save-status indicator
- Centralized atlas schema validation (`validateAtlas`/`assertValidAtlas`/`formatAtlasErrors`) into a new `@three-flatland/schemas` package, published separately from the runtime so ajv no longer ships in the `three-flatland` bundle (~35 kB brotli removed; full bundle now 22.26 kB brotli, down from 56.91 kB)
- Added codegen (`pnpm gen:types` / `gen:types:verify`) that generates `atlas.types.gen.ts` from `schema.json` for both `three-flatland` and `tools/io`, wired into CI so generated types can't silently drift from the schema
- Relaxed `meta` requiredness in the atlas schema (only `size` required) and added `anyOf(sources, image)` so both TexturePacker/Aseprite raw exports (`meta.image`) and the newer `meta.sources` shape validate
- Added per-frame polygon mesh fields to the `Frame` schema: baked `mesh` (verts/indices) and TexturePacker's `vertices`/`verticesUV`/`triangles`, with `mesh` preferred on read
- `SpriteSheetLoader` and `AnimatedSprite2D` now support both the legacy `meta.image` string and the new `meta.sources[0].uri` atlas format
- Atlas-sourced animations: when a loaded `SpriteSheet` carries named animations (`meta.animations` / Aseprite `frameTags`) and no explicit `animationSet` is given, `AnimatedSprite2D`'s controller auto-populates from them; an explicit `animationSet` still takes precedence

## Fixes

- Fixed a schema regression where nesting the `sources`/`image` `anyOf` inside `meta`'s own subschema collapsed codegen for the whole `meta` object, silently dropping all typed fields (including `animations`) from the generated `AtlasJson` type
- Fixed `AnimatedSprite2D` crashing on `new AnimatedSprite2D({})` due to a missing optional-chain on `options.spriteSheet.animations`
- Fixed `SpriteSheetLoader` throwing on atlases using legacy `meta.image` instead of `meta.sources`

## BREAKING CHANGES

- `three-flatland`'s atlas schema JSON and validator (`sprites/atlas`, `sprites/atlas.schema.json`) have moved to the new `@three-flatland/schemas` package; import atlas validation from `@three-flatland/schemas/atlas` instead

Ships atlas-format flexibility (TexturePacker/Aseprite legacy support), atlas-driven sprite animations, an editor-side atlas sidecar save flow, and a leaner runtime bundle by moving schema validation out of `three-flatland` and into `@three-flatland/schemas`.
