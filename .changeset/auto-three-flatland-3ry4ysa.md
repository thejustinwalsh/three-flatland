---
"three-flatland": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Sprite atlas schema, animation loading, and validator refactor

- Atlas JSON schema (`@three-flatland/schemas`) now supports both `meta.sources` and legacy single `meta.image` shapes — raw TexturePacker/Aseprite exports validate without modification
- Added per-frame polygon mesh fields to the atlas schema: baked `mesh` (verts/indices) plus TexturePacker's `vertices`/`verticesUV`/`triangles` (read priority: `mesh` first)
- `SpriteSheetLoader` resolves the source image URI from `meta.sources[0].uri` or falls back to legacy `meta.image`, fixing a crash on sidecars without `meta.sources`
- `AnimatedSprite2D` auto-populates its animation controller from atlas-sourced named animations (`meta.animations` / Aseprite `frameTags`) when no explicit `animationSet` is given; explicit `animationSet` still wins
- Fixed a crash in `new AnimatedSprite2D({})` caused by missing optional chaining on `spriteSheet.animations`
- Moved atlas schema + validator (`validateAtlas`/`assertValidAtlas`/`formatAtlasErrors`) into a new `@three-flatland/schemas` package; `three-flatland` no longer bundles Ajv (full bundle: 56.91 kB -> 22.26 kB brotli)
- Generated `atlas.types.gen.ts` type files (via `json-schema-to-typescript`) are now committed in both `three-flatland` and `tools/io`, with `pnpm gen:types:verify` wired into CI to catch schema/type drift
- VSCode atlas tool: added sidecar save support (`<basename>.atlas.json`) with a themed save-status chip, Cmd/Ctrl+S shortcut, and canvas/UI responsiveness improvements

## BREAKING CHANGES

- `three-flatland/sprites/atlas` and `./sprites/atlas.schema.json` exports removed; consumers must import validation from `@three-flatland/schemas/atlas` instead

Atlas loading is now more tolerant of real-world TexturePacker/Aseprite exports, animations can be driven directly from atlas data, and schema validation has moved out of the runtime bundle into a dedicated schemas package.
