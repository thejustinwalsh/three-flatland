---
"three-flatland": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Atlas schema & validation

- New `@three-flatland/schemas` package: canonical `schema.json` + Ajv validators for the atlas format, silo'd out of `three-flatland` runtime (removes Ajv from the bundle — full build drops 56.91 kB → 22.26 kB brotli, -34.65 kB)
- Atlas schema JSON hosted from the docs site for external `$ref` consumers
- `scripts/gen-schema-types.ts` codegens `atlas.types.gen.ts` from schema.json into both `three-flatland` and `tools/io`; committed so a fresh checkout builds without the codegen toolchain; `pnpm gen:types:verify` now wired into CI's build/verify step to catch drift
- Relaxed atlas `meta` requiredness: only `size` is required now, `meta.sources` and legacy `meta.image` both validate via `anyOf` — fixes raw TexturePacker/Aseprite exports (image-only meta) failing validation and crashing `validateAtlas()`
- Added per-frame polygon fields to `Frame`: baked `mesh` (verts/indices) plus TexturePacker's `vertices`/`verticesUV`/`triangles`, with `mesh` preferred on read
- Fixed a schema/codegen bug where nesting `sources`/`image` `anyOf` directly inside `meta`'s subschema collapsed generated `AtlasJson` typing to a bare index signature, silently dropping every typed `meta.*` field (including `animations`)
- `validateAtlas`/`assertValidAtlas`/`formatAtlasErrors` centralized with a format-uniqueness check; `tools/vscode` validator now re-exports from `@three-flatland/schemas/atlas` instead of duplicating the implementation

## Sprite animations

- `AnimatedSprite2D` now auto-populates its animation controller from a loaded `SpriteSheet`'s named animations (`meta.animations` / Aseprite `frameTags`) via `sheetAnimationsToDefinition()` when no explicit `animationSet` is given — in both the constructor and the `spriteSheet` setter. An explicit `animationSet` still takes priority
- Fixed a crash in `new AnimatedSprite2D({})` caused by missing optional chaining on `options.spriteSheet.animations`
- `SpriteSheetLoader` now tolerates legacy `meta.image` atlases (`meta.sources?.[0]?.uri ?? meta.image`), fixing a runtime crash ("Cannot read properties of undefined (reading '0')") on any sidecar without `meta.sources`

## Editor tooling (atlas panel)

- Atlas sidecar save workflow: `<basename>.atlas.json` written next to the source image via the new `atlas.schema.json` ($id `https://three-flatland.dev/schemas/atlas.v1.json`), a superset of TexturePacker's JSON-Hash format
- Editor Save button + Cmd/Ctrl+S write the sidecar, with a themed status chip ("Saving atlas…" → "Saved N frames → knight.atlas.json", auto-hiding) and error state on failure
- Canvas import restructuring and UI responsiveness improvements across the atlas/animation preview tooling

## BREAKING CHANGES

- `three-flatland`'s `./sprites/atlas` and `./sprites/atlas.schema.json` subpath exports are removed; atlas schema validation now lives in `@three-flatland/schemas` (`@three-flatland/schemas/atlas`) instead

## Summary

Atlas schema validation moves to a dedicated `@three-flatland/schemas` package (dropping ~35 kB of Ajv from the runtime bundle), atlas `meta` becomes more permissive to support real-world TexturePacker/Aseprite exports, sprites gain automatic animation population from atlas metadata, and the VSCode atlas editor gains a full sidecar save workflow.
