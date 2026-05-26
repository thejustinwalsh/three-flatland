---
"three-flatland": minor
---

> Branch: feat-vscode-tools
> PR: https://github.com/thejustinwalsh/three-flatland/pull/117

## Atlas schema, animation integration, and bundle size reduction

### Atlas JSON Schema

- New canonical atlas schema (`atlas.v1.json`, hosted at `https://three-flatland.dev/schemas/atlas.v1.json`) — superset of TexturePacker's JSON-Hash format; all three-flatland additions (`meta.sources`, `meta.normal`, `meta.animations`, etc.) are optional and additive
- Every existing TexturePacker/Aseprite export validates against the schema without changes
- Schema published via docs site URL so editors resolve `$schema` for autocomplete

### New `@three-flatland/schemas` package

- New `@three-flatland/schemas` workspace package owns the canonical `atlas.schema.json` and Ajv validators
- `@three-flatland/schemas/atlas` subpath exports `validateAtlas`, `assertValidAtlas`, and `formatAtlasErrors`
- `scripts/gen-schema-types.ts` codegen writes self-contained `.gen.ts` type files into `three-flatland` and `tools/io`; generated files committed so a clean checkout builds without the codegen toolchain

### Runtime bundle reduction

- Removed Ajv from the `three-flatland` runtime bundle; validation is now a dev/tool-time concern
- `three-flatland` full bundle: **56.91 kB -> 22.26 kB brotli (-34.65 kB)**
- Zero Ajv references remain in the published package

### Atlas-sourced animations in `SpriteSheetLoader` and `AnimatedSprite2D`

- `SpriteSheetLoader` now parses `meta.animations` (and Aseprite `frameTags`) into named animation definitions on `SpriteSheet.animations`
- `AnimatedSprite2D` auto-populates its animation controller from `sheet.animations` when no explicit `animationSet` is provided; explicit `animationSet` still wins
- `meta.sources` (multi-source atlas) and legacy `meta.image` (single-image TexturePacker/Aseprite export) are both supported -- `meta.sources?.[0]?.uri ?? meta.image` resolves the image URI tolerantly
- `wireAnimationToInput` defaults `fps`, `loop`, and `pingPong` since the schema marks them optional on the wire
- `AtlasJson` type is now a single source of truth via the generated file, shared across `three-flatland` and `tools/io`

### VSCode atlas editor

- Save sidecar (`<basename>.atlas.json`) from the atlas editor via toolbar Save button or Cmd/Ctrl+S; writes next to the source image via `workspace.fs` (remote/virtual workspace friendly)
- Save status chip: animated "Saving atlas..." -> "Saved N frames -> knight.atlas.json" (auto-hides after 2.5s), red error bar on failure
- Canvas context (`CanvasContext.ts`) extracted; `CanvasStage` relays `onImageReady` so save payload includes natural pixel dimensions in `meta.size`
- Image decoder worker (`imageDecoderWorker.ts`) added for off-thread image decoding
- Animation timeline, animation preview pip, and animation drawer improved for responsiveness and accuracy
- Rect overlay and canvas background rendering refactored

### Bug fixes

- Fixed runtime crash (`Cannot read properties of undefined (reading '0')`) in `SpriteSheetLoader` when loading TexturePacker/Aseprite exports that use `meta.image` instead of `meta.sources`; regression test added

This release delivers end-to-end atlas animation support -- from schema-validated sidecar files authored in the VSCode editor through to `AnimatedSprite2D` auto-animating from atlas-embedded frame tags -- while cutting the runtime bundle by 60% by moving Ajv to a dedicated schemas package.
