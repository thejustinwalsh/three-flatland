---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27
**2D lighting system**
- Full 2D lighting pipeline: JFA-based SDF generation, Forward+ tiled light culling with SDF occlusion, Radiance Cascades GI
- `Light2D` class supporting point, directional, ambient, and spot light types
- `LightEffect` base class + `LightEffectBuildContext` for composable shader-level lighting strategies
- `DefaultLightEffect` and `DirectLightEffect` wired with real `shadowSDF2D` traces (replaces `shadow = float(1.0)` stub)
- SDF texture, world-size, and world-offset uniforms threaded through build context — zero shader rebuilds on resize
- ECS systems: `lightEffectSystem`, `lightMaterialAssignSystem`, `lightSyncSystem`, `shadowPipelineSystem`, `effectTraitsSystem`
- React attach helpers for declarative `<LightEffect />` usage

**Per-sprite shadow radius**
- `Sprite2D.shadowRadius?: number` — `undefined` (default) auto-derives from `max(|scaleX|, |scaleY|)` each frame; assign a number to override
- Preserved across `clone()`; tracks `AnimatedSprite2D` frame-source-size changes at no extra sync cost
- `readShadowRadius()` TSL helper exposes the per-instance value in shaders
- `DefaultLightEffect.shadowStartOffsetScale` (default 1.0) multiplies the per-instance radius — replaces the old scene-wide `shadowStartOffset` uniform

**Per-light `castsShadow`**
- `Light2D.castsShadow` field (default `true`) preserved across `clone()`
- Packed into `LightStore` row 3 column B; `DefaultLightEffect` reads it to skip the 32-tap SDF trace for cosmetic lights
- Shadow trace also gated on attenuation (`<= 0.01`), N·L, and ambient type — O(casting lights) cost in dense scenes

**Instance buffer layout (internal)**
- Core per-instance data (UV, color, flip, system flags, enable bits, shadow radius, extras) consolidated into a single `InstancedInterleavedBuffer` with four attribute views: `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`
- Collapses 3 vertex buffer bindings into 1, freeing 3 slots within WebGPU's `maxVertexBuffers=8` cap
- `effectBuf0+` is now pure `MaterialEffect` data with no reserved system slots; effect-slot allocator starts at offset 0
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` (3 effectBufs × 4 floats); exceeding it throws at `registerEffect` time instead of silently failing at draw time
- Public API unchanged — `Sprite2D.shadowRadius`, `castsShadow`, `addEffect()`, etc. behave identically

**TSL instance-attribute helpers**
- `readFlip()` → `vec2` at `instanceSystem.xy`
- `readSystemFlags()` → `int` at `instanceSystem.z` (raw bitfield)
- `readEnableBits()` → `int` at `instanceSystem.w`
- `readLitFlag()` → `bool`, bit 0 of system flags
- Existing `readReceiveShadowsFlag`, `readCastShadowFlag`, `wrapWithLightFlags` delegate to these helpers
- All helpers moved to `materials/instanceAttributes.ts` and re-exported from the `three-flatland` entry

**Signed SDF generation**
- `SDFGenerator` produces a signed distance field using a packed RGBA JFA layout: `R,G` = nearest-occluder seed UV (outside distance), `B,A` = nearest-empty seed UV (inside distance)
- Single ping-pong JFA chain at the same VRAM cost as the old unsigned generator (~8 MB at half-res)
- Registered debug textures: `sdf.distanceField`, `sdf.jfaPing`, `sdf.jfaPong`, `occlusion.mask`
- 5-tap separable binomial blur applied to SDF for smoother distance transitions
- Default render resolution scale changed to 0.5 for out-of-the-box performance

**Normal descriptor loader**
- `normalDescriptor.ts` loader reads a `.normal.json` sidecar and resolves per-region normal-map URLs
- `LDtkLoader`, `SpriteSheetLoader`, and `TiledLoader` updated to pass through normal-descriptor metadata

**Debug / DevtoolsProvider**
- `DevtoolsProvider` constructor is now side-effect-free; explicit `start()` / `dispose()` lifecycle, both idempotent
- `Flatland.render()` lazy-starts the provider on first call
- `createDevtoolsProvider(opts?)` helper for vanilla apps without a `Flatland` instance
- `BatchCollector` publishes per-batch ECS diagnostics
- Debug registrations that arrive before `DevtoolsProvider.start()` are queued and replayed
- Debug texture readback moved to end-of-frame (after all render passes complete) — eliminates mid-frame capture artifacts
- `DebugTextureRegistry` gains `maxDim` cap per entry with a lazy GPU `Downsampler`; invalidates cached samples on render-target resize
- Pool tier raised to 2 MB large / 4 KB small; oversized entries ship metadata-only with a one-shot warning
- Off-thread BroadcastChannel via dedicated bus worker with transferable pool buffers — zero allocations on render thread per flush
- `buffer:chunk` WebCodecs VP9 streaming for fullscreen buffer modal; raw-pixel fallback when WebCodecs unavailable
- `SubscriberRegistry` tracks per-consumer buffer selections; `DevtoolsProvider` drains only the subscribed union
- `perf-track.ts` emits User Timing spans on Chrome's custom-track extension for provider flush and bus-receive latency

**React / R3F**
- `usePane` uses `driver:'raf'` — no `useFrame` dependency
- `usePaneFolder` / `usePaneInput` use `useLayoutEffect` with `[parent, key]` deps; immediate cleanup (no `setTimeout` hack)
- New `<DevtoolsProvider />` R3F component — passive sampler, tree-shaken in production
- `useFrame` priority switched from positional `useFrame(cb, 1000)` to options-object form

This release delivers the full 2D lighting pipeline — signed-SDF soft shadows, tiled Forward+ culling, per-sprite shadow radius, and per-light castsShadow gating — alongside a production-ready DevtoolsProvider with off-thread data transport.
