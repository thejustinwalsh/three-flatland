---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting pipeline**

- Complete 2D lighting system: JFA-based signed SDF generation, Forward+ tiled light culling with SDF occlusion, and Radiance Cascades GI (experimental)
- `SDFGenerator` produces a signed distance field via a packed RGBA JFA chain (R,G = nearest-occluder seed; B,A = nearest-empty-space seed) — same VRAM and pass count as the previous unsigned generator, with correct inside/outside sign for self-shadow detection
- `OcclusionPass` renders sprite alpha silhouettes as the SDF seed; resolution defaults to 0.5× for performance
- 5-tap separable binomial blur applied to SDF output for smoother transitions
- `Light2D` class with point, directional, ambient, and spot types; per-light `castsShadow` flag (default `true`) packed into lights DataTexture row3.b
- `LightStore` serializes `Light2D` instances into an RGBA32F DataTexture; `castsShadow` flag verified by tests
- `LightEffect` system: trait-based registry, `setLighting()` on `Flatland`, attach helpers for R3F integration
- `ForwardPlusLighting`: tiled light culling, `LightStore` + tile texture published as `lightStore.lights` / `forwardPlus.tiles` for devtools inspection
- `shadowPipelineSystem` wires `SDFGenerator` and `OcclusionPass` into the ECS pipeline; `SDFGenerator` eagerly allocates 1×1 placeholder RTs at construction so `sdfTexture` references are stable for TSL shader capture
- World-bound uniforms (`worldSizeNode` / `worldOffsetNode`) owned by `Flatland`, updated from camera bounds each frame, threaded through `LightEffectBuildContext`

**Per-sprite shadow radius**

- `Sprite2D.shadowRadius?: number` — `undefined` (default) = auto-resolve as `max(|scale.x|, |scale.y|)` each frame via `transformSyncSystem`, tracking scale changes including animated source-size swaps; explicit number overrides; preserved across `clone()`
- Shadow radius packed into interleaved instance buffer (`instanceExtras.x`); `readShadowRadius()` TSL helper reads it in shaders

**Interleaved instance buffer**

- Core per-instance data consolidated into a single `InstancedInterleavedBuffer` with four attribute views: `instanceUV` (offset 0), `instanceColor` (4), `instanceSystem` (8), `instanceExtras` (12) — collapses 3 bindings into 1, freeing 3 WebGPU vertex buffer slots
- Effect-slot allocator now starts at offset 0; `EffectMaterial.MAX_EFFECT_FLOATS = 12` (3 effectBufs × 4 floats) with a clear throw at `registerEffect` when the cap would be exceeded
- Public API unchanged: `Sprite2D.shadowRadius`, `sprite.castsShadow`, `readCastShadowFlag()`, `readShadowRadius()`, `addEffect()` all behave identically

**TSL instance attribute helpers**

- New typed TSL helpers in `materials/instanceAttributes.ts`: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readReceiveShadowsFlag()`, `readCastShadowFlag()`, `readShadowRadius()`; existing helpers delegated to these for DRY
- `wrapWithLightFlags` remains in `lights/` as the lit-gate wrapper; attribute helpers moved to `materials/`
- All helpers re-exported from the main `three-flatland` entry point

**Loaders**

- `normalDescriptor.ts`: loader for `.normal.json` sidecar descriptor files alongside the runtime `normalFromSprite` fallback path
- LDtk, Tiled, and SpriteSheet loaders updated to carry normal map metadata

**Debug infrastructure**

- `DevtoolsProvider` constructor is side-effect-free; explicit `start()`/`dispose()` lifecycle; `Flatland.render()` lazy-starts on first call
- `createDevtoolsProvider(opts?)` helper exported from `three-flatland` for vanilla (non-Flatland) apps; returns a no-op stub in production builds
- `DebugRegistry` (CPU typed-array sink) and `DebugTextureRegistry` (GPU render target / DataTexture readback) with per-entry version tracking and `maxDim` downsampling
- Bus worker offloads `BroadcastChannel` hot path from the render thread; pool-buffer transport (`bus-pool.ts`, `bus-transport.ts`) achieves zero allocation on the render thread during flush
- Multi-provider discovery protocol: `provider:announce`, `provider:query`, `provider:gone`; per-provider data channels; consumer auto-selects by kind preference
- `pixel-convert.ts`: worker-side pixel format converter (rgba8, r8, rgba16f, rgba32f) with display modes colors/normalize/mono/signed/alpha; 11 unit tests
- `perf-track.ts`: `perfMeasure`/`perfStart` emit User Timing spans on Chrome's custom-track extension (trackGroup `three-flatland`)
- Debug registrations queued if they arrive before `DevtoolsProvider.start()` — fixes dropped registrations from constructors that run before first `render()`
- Texture readback moved to end-of-frame; RenderTarget dimension changes trigger version bump and re-read

`three-flatland` delivers a complete 2D lighting pipeline with signed-SDF shadows, per-sprite occluder radii, a reformed interleaved instance buffer, and a zero-allocation devtools bus — all with no public API changes to existing sprite and tilemap code.
