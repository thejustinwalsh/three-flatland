---
"three-flatland": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Sprite atlas: schema, validation, and animations

- Relax atlas schema `meta` requiredness to just `size`; add `anyOf(sources, image)` so both TexturePacker/Aseprite raw exports (`meta.image`) and three-flatland's multi-source atlases (`meta.sources`) validate
- `SpriteSheetLoader` and `validateAtlas()` now tolerate legacy `meta.image` atlases (resolve image URI via `meta.sources?.[0]?.uri ?? meta.image`) instead of throwing on undefined `meta.sources`
- Add per-frame polygon fields to the atlas schema: baked `mesh` (verts/indices) plus TexturePacker's `vertices`/`verticesUV`/`triangles`, mesh preferred when both present
- `AnimatedSprite2D` auto-populates its animation controller from atlas-sourced `meta.animations` / Aseprite `frameTags` when no explicit `animationSet` is given; explicit `animationSet` still wins
- Fix `AnimatedSprite2D` crash on `new AnimatedSprite2D({})` (missing optional chaining on `options.spriteSheet.animations`)
- New `atlas.schema.json` ($id `https://three-flatland.dev/schemas/atlas.v1.json`), a superset of TexturePacker's JSON-Hash format; three-flatland extensions (`meta.app`, `meta.version`, `meta.sources`, `meta.normal`, `meta.animations`) are optional/additive

## Schema/validator restructuring

- Moved the canonical atlas schema and its ajv-based validators out of `three-flatland` into a new `@three-flatland/schemas` package (subpath `@three-flatland/schemas/atlas`); `three-flatland` no longer bundles ajv (~35 kB brotli reduction, 56.91 kB → 22.26 kB brotli)
- Added a type-generation script (`pnpm gen:types`, `--verify` for CI drift checks) that produces `atlas.types.gen.ts` from `schema.json` for both `three-flatland` and `tools/io`, keeping the schema as the single source of truth for `AtlasJson`/`WireAnimation`
- CI now runs `pnpm gen:types:verify` in the build job so generated types can't silently drift from the schema

## BREAKING CHANGES

- Removed `three-flatland`'s `./sprites/atlas` and `./sprites/atlas.schema.json` package exports and the `ajv` dependency. Consumers importing `validateAtlas`/`assertValidAtlas` or the raw schema JSON from `three-flatland` must switch to `@three-flatland/schemas/atlas`.

Sprite atlas loading is now more permissive of real-world TexturePacker/Aseprite exports, animations auto-load from atlas metadata, and schema validation has moved out of the runtime bundle into a dedicated `@three-flatland/schemas` package.
