---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27


## three-flatland

### 2D lighting pipeline — core
- `ForwardPlusLighting` system: tile-based Forward+ culling, hero lights bypass fill-slot competition, fills capped per tile; CPU tile-world-bound math fixed to match shader `floor(screenPos / TILE_SIZE)` (eliminates tile-boundary checkerboard at non-TILE_SIZE-multiple viewports)
- `LightStore`: backing `DataTexture` published to `DebugTextureRegistry` as `lightStore.lights`; `ForwardPlusLighting._tileTexture` published as `forwardPlus.tiles`
- `Light2D.category?: string` — djb2-hashed to bucket 0–3 for per-category fill quotas; `Light2D.importance` bias on tile-ranking score for hero lights
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` hard cap with descriptive error (prevents silent WebGPU pipeline rejection)
- Zero-alloc per-frame `runtimeCtx` — module-level scratch object, mutated in place; eliminates per-call heap churn in the lighting hot path

### 2D lighting pipeline — shadow system
- `SDFGenerator` dual JFA chains: signed SDF (outside + inside distance); debug buffers named `sdf.jfaPing/PongOutside` and `sdf.jfaPing/PongInside`
- Shadow trace gated on `castsShadow` flag and sub-visible attenuation (`atten <= 0.01`) — cosmetic fill lights never pay the 32-tap SDF cost
- `shadowPipelineSystem` moved to `append` position — runs after `conditionalTransformSyncSystem` + `flushDirtyRangesSystem` so the occluder pre-pass sees current-frame matrices (fixes one-frame shadow lag)
- Occluder-dirty gate: SDF regeneration skipped when occluders, camera frustum, position, and zoom are all unchanged — free in manually invalidated scenes
- `shadowFilter` controls SDF + blur RT sample filter; JFA ping-pong stays nearest

### Instance buffer refactor
- Per-instance core data (UV, color, flip, system flags, enable bits, shadow radius) interleaved into a single `InstancedInterleavedBuffer` with 4 attribute views — frees 3 WebGPU vertex buffer slots (was at the `maxVertexBuffers=8` cap)
- New typed TSL helpers: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()` — internal layout refactorable in one place
- `effectBuf0+` now pure `MaterialEffect` data starting at offset 0 (no reserved core slots)
- Per-sprite `shadowRadius` attribute: auto-derived from `max(|scale.x|, |scale.y|)` each frame; `Sprite2D.shadowRadius?: number` overrides

### Sprite2D observable refactor
- `Sprite2D` internal state migrated to observable strategy pattern — change detection unified; removes redundant per-property dirty flags
- `SpriteGroup` reactive hooks wired to the observable; downstream `SpriteRenderer` gets precise dirty ranges without full-group scans
- Eliminates the per-frame `isDirty` polling loop over all sprites

### ECS & pipeline performance
- `flushDirtyRangesSystem` consolidated — single pass writes all pending attribute range updates to GPU buffers; no per-system redundant uploads
- `conditionalTransformSyncSystem` skips transform propagation when no sprites in the group moved
- `SpriteSheet` atlas upload deferred to first render (avoids redundant upload on construction)

### Devtools integration
- `createDevtoolsProvider(renderer, scene, camera)` helper — wires `DevtoolsProvider` + `StatsCollector` with a single call; replaces per-example boilerplate
- GPU timestamp ownership moved to `StatsCollector`; provider no longer holds the query set (eliminates double-acquire with multiple providers)
- `DEVTOOLS_BUNDLED` compile-time gate: all debug paths (`registerDebugArray`, `touchDebugArray`, `registerDebugTexture`, `DebugTextureRegistry`) are no-ops in prod; bundle: 45.4 KB → 36.3 KB
- `BusPool` 256 KB medium tier prevents head-of-line blocking on large stats frames; stats emitted as `subarray` views (zero copy)

### Normal map integration
- `NormalMapLoader` / `resolveNormalMap` wired into `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`
- `NormalMapProvider` reads `readFlip()` helper for per-sprite UV flip (removes `as unknown as` cast)

### Loader API
- `forceRuntime` replaces `skipBakedProbe` / `disableRuntimeBake` across all loaders (`SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`)

### Bug fixes
- Bus-worker URL resolved relative to the worker module file (fixes `Cannot find module` in Vite dev server when the app root differs from `three-flatland`'s install path)
- Redundant `lightDir.normalize()` in spot cone math removed (direction is normalised at set-site; double-normalise was a no-op with NaN edge-case risk)
- Dead `fillScale` shader multiply and per-tile compensation meta-texel pass removed (meta texels were never consumed downstream)

This release ships the complete 2D lighting system: tile-based Forward+ culling, signed-SDF sphere-trace shadows with per-sprite radii, interleaved instance buffers, an observable `Sprite2D` architecture, and a zero-cost debug surface via `DEVTOOLS_BUNDLED` dead-stripping.
