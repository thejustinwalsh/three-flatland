---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## three-flatland

### New features

**2D lighting pipeline**

- **JFA-based signed SDF generator** (`SDFGenerator`): packed dual-channel ping-pong layout computes signed distance (`distOutside - distInside`) at the same VRAM and pass cost as the prior unsigned generator; supports `setFilter(nearest|linear)` for the SDF and blur render targets
- **Forward+ tiled light culling** (`ForwardPlusLighting`): screen-space tile grid with TILE_SIZE 32px (4× CPU speedup vs. 16px); corrected CPU tile bounds to match the shader's `floor(screenPos / TILE_SIZE)` stride, eliminating checkerboard gaps at non-multiple-of-32 viewport heights
- **Occluder-dirty gate**: shadow pipeline skips the occluder render + 15-pass JFA/blur regen when occluders and camera are unchanged; now tracks `OrthographicCamera.zoom` in addition to frustum bounds and position
- **`shadowPipelineSystem`**: moved to `append` phase so it runs after transform sync; shadow pipeline now sees freshly-uploaded matrices, fixing one-frame shadow lag on moving casters
- **`Light2D`**: `castsShadow` per-light flag (packed into LightStore row 3 column B); `importance` multiplicative priority bias; `category?: string` hashed via djb2 to a 2-bit fill bucket; all preserved across `clone()`
- **Per-sprite `shadowRadius`**: `Sprite2D.shadowRadius?: number` — `undefined` auto-derives from `max(|scale.x|, |scale.y|)` per frame; eliminates the scene-wide start-offset guess
- **`normalDescriptor.ts`**: runtime normal-source descriptor loader; `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader` all resolve normals from a `NormalSourceDescriptor` via `resolveNormalMap`
- **`forceRuntime` option**: unified baked-asset probe opt-out across `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`; replaces `skipBakedProbe`
- **`createDevtoolsProvider` helper**: exported from the main entry for vanilla Three.js apps; returns a no-op stub in production

**Instance buffer**

- **Interleaved core instance buffer**: UV, color, flip/system flags, enable bits, and shadow radius packed into a single `InstancedInterleavedBuffer` (4 attribute views: `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`); frees 3 WebGPU vertex buffer slots previously consumed by split attributes
- **`instanceAttributes.ts`**: typed TSL helpers for every named field — `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readShadowRadius()`, `readCastShadowFlag()`, `readReceiveShadowsFlag()`; re-exported via the `lights` barrel
- **`EffectMaterial.MAX_EFFECT_FLOATS`**: static cap (12 floats / 3 effectBufs); clear error at `registerEffect` if cumulative effect data would exceed this instead of failing at draw time

**Sprite2D**

- **Observable strategies**: `Sprite2D.tint` and `anchor` now delegate to shared `observable.color.attach` / `observable.vector2.attach`; deleted ~100 lines of inline duplicate

**Devtools / debug**

- **Dead-strip production bundles**: `DevtoolsProvider` lazy-loaded via dynamic `import()` behind a bundler-replaceable `process.env` guard (45.4 KB → 36.3 KB)
- **Perf-track gated on dev only**: per-system ECS instrumentation (`performance.now()` + `perfMeasure`) stripped from production builds even when `FL_DEVTOOLS=true`
- **Per-system ECS perf tracks**: `add()`/`prepend()` require `{track, name}` labels; `run()` emits colored per-system spans on Chrome's custom track extension
- **Pixel format conversion** (`pixel-convert.ts`): `rgba8`, `r8`, `rgba16f`, `rgba32f` with display modes `colors`, `normalize`, `mono`, `signed`, `alpha`; GPU row-padding detection and correction; 11 unit tests
- **Texture readback moved to end-of-frame**: `endFrame()` enqueues readbacks after all render passes complete, preventing partial-frame captures
- **Buffer stream keyframe on switch**: `forceKeyFrame` plumbed through `ConvertRequest` → worker → `StreamEncoder` so buffer switches don't stall the VP9 decoder
- **Debug texture registrations**: `sdf.distanceField`, `occlusion.mask`, `sdf.jfaPing/Pong`, `lightStore.lights`, `forwardPlus.tiles`

### Performance

- **TILE_SIZE 16 → 32**: quarters the CPU tile-assignment loop at 1920×1080; no behavior change for scenes within the 32,768-tile max
- **Zero-alloc light-effect runtime context**: `lightEffectSystem` reuses a module-level scratch object; `LightingContext.worldSize`/`worldOffset` use mutated `Vector2`s
- **Shadow trace gates**: skips the 32-tap SDF trace per light when `castsShadow: false` or attenuation ≤ 0.01
- **SDF default resolution**: OcclusionPass defaults to 0.5× screen resolution

### Bug fixes

- Fixed `bus-worker` URL resolution: extensionless `new URL('./bus-worker', import.meta.url)` lets bundlers resolve `.ts` (source) or `.js` (dist) correctly
- Fixed `process.env` type errors in consumers using `types: ["vite/client"]`: module-local `declare const process` added to each gating file
- Fixed CPU tile bounds drift vs. shader tile math: CPU now uses `TILE_SIZE / screenSize * worldSize` stride to match the shader's implicit stride exactly
- Resolved type-aware lint errors across debug, loaders, and lighting modules

### BREAKING CHANGES

- **Interleaved instance buffer**: internal attribute names and offsets changed (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras` replace the prior split attributes). Public APIs (`Sprite2D`, `addEffect()`, `readCastShadowFlag()`, etc.) are unchanged.
- **`skipBakedProbe` removed** from `SpriteSheetLoader`, `LDtkLoader`, and `TiledLoader`; use `forceRuntime: true`
- **`DEVTOOLS_BUNDLED` re-export removed** (was unreleased on this branch)

This release ships the complete 2D lighting pipeline — JFA signed SDF, Forward+ light culling with per-category fill quotas, per-sprite shadow radius, SDF sphere-trace shadows, and a production-dead-stripped devtools subsystem.
