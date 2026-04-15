---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27


**2D Lighting system**

- New `Light2D` class with point, directional, ambient, and spot light types
- JFA-based `SDFGenerator` produces a signed-distance field from sprite occlusion silhouettes
- Forward+ tiled light culling with reservoir-based importance overflow — dense tiles evict the weakest occupant rather than dropping lights in scene-graph order, eliminating tile-edge flicker
- `OcclusionPass` renders sprite silhouettes into a half-resolution RT; `castsShadow` per-instance flag (bit-masked, default off) gates which sprites contribute
- `shadowSDF2D` sphere-trace wired into `DefaultLightEffect` and `DirectLightEffect`; `shadow = float(1.0)` stub replaced — controlled by `shadowStrength`, `shadowSoftness`, `shadowBias` uniforms
- Shadow pipeline state moved to an ECS `ShadowPipeline` singleton trait + `shadowPipelineSystem`; `SDFGenerator` and `OcclusionPass` allocated eagerly on `setLighting` when `needsShadows`, idempotently managed by the system
- `LightEffectBuildContext` carries stable `sdfTexture`, `worldSizeNode`, `worldOffsetNode` uniforms; TSL texture bindings captured at shader-build time remain valid across resize
- `setLighting(effect)` / `add(sprite)` emit dev-time warnings for lit sprites missing required channel providers (deduped via `WeakSet`, suppressed in production)
- `createMaterialEffect` generic over the `provides` tuple — `channelNode` return type type-checked against declared channels at compile time

**effectBuf0 layout**

- `effectBuf0.x` now holds only system flags (lit, receiveShadows, castsShadow); `effectBuf0.y` holds effect enable bits (24 slots, up from 21)
- `EFFECT_BIT_OFFSET` reset to 0 — effect enable bits start at bit 0 of `.y` component
- Flag constants extracted to `materials/effectFlagBits.ts`, breaking the previous circular import

**Devtools bus (Phase A–C)**

- `debug-protocol.ts` sub-export: public types-only API for third-party bus subscribers
- `DevtoolsProvider` / `DevtoolsProducer` extracted from Flatland; any bare three.js app can instantiate directly
- Frame-accurate stats via `beginFrame` / `endFrame` boundaries — FPS and draw counts aggregate across all internal render passes (SDF, occlusion, main, post) per logical frame
- `DebugRegistry`: `registerDebugArray` / `touchDebugArray` / `unregisterDebugArray` module-level sinks; ForwardPlusLighting publishes `lightCounts` + `tileScores`; LightStore publishes its DataTexture
- `DebugTextureRegistry`: `registerDebugTexture` / `touchDebugTexture` / `unregisterDebugTexture`; `maxDim` cap with lazy GPU `Downsampler` before readback
- `perf-track.ts`: `perfMeasure` / `perfStart` User Timing spans on Chrome's custom track (`three-flatland` group)
- Multi-provider discovery: `provider:announce` / `provider:query` / `provider:gone`; `FlatlandOptions.name` for distinguishing instances
- Two-channel bus: shared discovery (`flatland-debug`) + per-provider data (`flatland-debug:<id>`)
- Delta-encoded `data` packets, idle `ping` every 2s, zero-alloc scratch-object hot path
- All devtools code gated by `DEVTOOLS_BUNDLED` (dead-code-eliminated in production builds)

**React integration**

- `attach` helpers updated; `usePane`/`createPane` wiring compatible with new devtools bus
- Lighting example rebuilt on Tweakpane + current API: dungeon floor, shadow-casting walls, wandering point-light enemies, flickering torches, WASD hero knight

## BREAKING CHANGES

- `Flatland.stats` getter removed; use `spriteGroup.stats` for sprite-domain metrics (spriteCount, batchCount, visibleSprites)
- `drawCalls` removed from the `RenderStats` interface
- `effectBuf0.y` now holds effect enable bits; custom `EffectMaterial` implementations that hard-coded bit positions in `.x` must be updated
- `EFFECT_BIT_OFFSET` is now `0` (was `3`); callers computing per-effect masks via `1 << (EFFECT_BIT_OFFSET + i)` continue to work without change
- `DevtoolsProducer` and `StatsCollector` no longer accept a `scene` constructor argument; use `beginFrame` / `endFrame` instead
- `setAutoSend` removed from `DevtoolsProducer`
- Subscribe payload fields `registryFilter` → `registry`, `atlasFilter` → `buffers`; third-party subscribers must update

This release delivers the full 2D lighting pipeline (SDF shadows, Forward+ culling, per-sprite shadow casting) and a complete Phase A–C devtools bus with live stats, CPU array inspection, and GPU buffer visualization.
