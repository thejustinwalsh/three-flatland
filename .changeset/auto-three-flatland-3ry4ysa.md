---
"three-flatland": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Sprite atlas schema & validation

- New `@three-flatland/schemas` package: canonical atlas JSON Schema + ajv validators, moved out of `three-flatland` runtime — cuts ~34.65 kB brotli (56.91 kB → 22.26 kB) from the full bundle by removing ajv entirely
- `AtlasJson`/`WireAnimation` types are now generated from schema.json via `scripts/gen-schema-types.ts` (codegen output committed; `pnpm gen:types:verify` now runs in CI)
- `meta.sources` is optional again — raw TexturePacker/Aseprite exports (`meta.image` string, no `meta.sources`) validate and load correctly; `SpriteSheetLoader` resolves the image URI as `meta.sources?.[0]?.uri ?? meta.image`
- Frame definitions accept per-frame polygon data: our own baked `mesh` (verts/indices) plus TexturePacker's `vertices`/`verticesUV`/`triangles`, with `mesh` preferred when both are present
- Fixed a schema-nesting regression that silently dropped every typed `meta.*` field (including `animations`) from the generated `AtlasJson` type

## Atlas-driven animations

- `AnimatedSprite2D` auto-populates its animation set from a loaded `SpriteSheet`'s named animations (`meta.animations` / Aseprite frame tags) when no explicit `animationSet` is given; an explicit `animationSet` still takes precedence
- Fixed a crash on `new AnimatedSprite2D({})` caused by missing optional chaining on `spriteSheet.animations`

## Atlas editor (VSCode tool)

- Atlas editor can now save a sidecar file (`<basename>.atlas.json`) next to the source image, via Toolbar Save button or Cmd/Ctrl+S, with a themed status chip showing save progress/result
- Centralized `validateAtlas`/`assertValidAtlas`/`formatAtlasErrors` behind `@three-flatland/schemas/atlas`, removing a duplicate ajv-based implementation in the VSCode extension
- Various canvas/animation-drawer UI and design-system primitive improvements (Toolbar, Button, CompactSelect, ToolbarButton)

## BREAKING CHANGES

- `three-flatland`'s `./sprites/atlas` and `./sprites/atlas.schema.json` subpath exports have been removed; consumers validating atlas JSON must depend on `@three-flatland/schemas/atlas` instead
- The `ajv` dependency has been dropped from `three-flatland` — any code relying on it transitively must add its own dependency

Atlas schema handling and validation move to a dedicated `@three-flatland/schemas` package, shrinking the `three-flatland` bundle and enabling atlas-driven `AnimatedSprite2D` animations, alongside a new save-sidecar workflow in the atlas editor.
