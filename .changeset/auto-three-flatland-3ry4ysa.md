---
"three-flatland": minor
---

> Branch: preview/tools-combined
> PR: https://github.com/thejustinwalsh/three-flatland/pull/172

## Atlas schema + sprite sheet animations

- Atlas JSON schema now supports both `meta.sources` (multi-source) and legacy
  `meta.image` (single string) — TexturePacker/Aseprite exports and old
  sidecars validate again without requiring a migration.
- Added per-frame polygon/mesh fields to the atlas `Frame` definition: baked
  `mesh` (verts/indices) plus TexturePacker's `vertices`/`verticesUV`/`triangles`,
  with `mesh` preferred when both are present.
- `SpriteSheetLoader` resolves the frame image URI tolerantly
  (`meta.sources?.[0]?.uri ?? meta.image`), fixing a runtime crash on sidecars
  that only ship `meta.image`.
- `AnimatedSprite2D` now auto-populates its animation set from a loaded
  `SpriteSheet`'s named animations (`meta.animations` / Aseprite `frameTags`)
  when no explicit `animationSet` is given; an explicit `animationSet` still
  takes priority. Fixed a crash on `new AnimatedSprite2D({})` from a missing
  optional-chain on `spriteSheet.animations`.
- Regenerated `atlas.types.gen.ts` in `three-flatland` and `tools/io` to match
  the updated schema; CI now runs `pnpm gen:types:verify` in the build job so
  generated types can't silently drift from `schema.json` again.

## Atlas validation moved out of the runtime bundle

- `validateAtlas`/`assertValidAtlas`/`formatAtlasErrors` and the atlas schema
  now live in the new `@three-flatland/schemas` package (subpath
  `@three-flatland/schemas/atlas`), instead of `three-flatland`.
- Removed the `ajv` dependency and the `./sprites/atlas` and
  `./sprites/atlas.schema.json` exports from `three-flatland` — schema
  validation is a dev/tool-time concern now, not a runtime one. This shrank
  the full `three-flatland` bundle from 56.91 kB to 22.26 kB brotli (-34.65 kB).
- `tools/io` and the VSCode atlas tools now import the validator from
  `@three-flatland/schemas/atlas` instead of duplicating it.
- Schema JSON is published from the docs site for external `$ref` consumers.

## VSCode atlas editor

- Added a save affordance (`Cmd/Ctrl+S` and a toolbar button) that writes a
  `<basename>.atlas.json` sidecar next to the source image, with a themed
  status chip showing saving/saved/error state.
- Various canvas/animation-editor UI and responsiveness improvements in
  `tools/preview` and the VSCode atlas webview.

## BREAKING CHANGES

- `three-flatland` no longer exports `./sprites/atlas` or
  `./sprites/atlas.schema.json`. Consumers importing `validateAtlas`,
  `assertValidAtlas`, or the raw schema JSON from `three-flatland` must switch
  to `@three-flatland/schemas` / `@three-flatland/schemas/atlas`.

Atlas JSON handling is now more permissive (legacy `meta.image`, per-frame
mesh data) and schema validation has moved to a dedicated `@three-flatland/schemas`
package, trimming the `three-flatland` runtime bundle and enabling
animation-aware sprite sheets.
