---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Forward+ Lighting

- Hero/fill light separation: hero lights (`castsShadow: true`) compete in an uncapped global pool; fill lights (`castsShadow: false`) capped at 2 slots per tile, never evict heroes
- `Light2D.importance` (default `1.0`) — multiplicative score bias; use high values (e.g. `10`) on hero lights to resist eviction by dense fill clusters
- `Light2D.category?: string` — fill lights hash to independent per-category buckets (0–3) via djb2; distinct fill types (slime glow vs water ripple) no longer compete for the same tile quota
- Per-tile fill compensation tracked per-category in the tile meta texel; shader reads per-light bucket via `row3.a`
- Dropped per-tile `fillScale` shader multiply that caused grid-aligned brightness banding; culled fills are simply absent rather than incorrectly amplified
- CPU tile bounds now match the shader's screen-pixel stride (`tileWorldStride = TILE_SIZE / screenSize * worldSize`), eliminating checkerboard gaps in dense light scenes
- `TILE_SIZE` bumped from 16 → 32, reducing tile count from ~8,160 to ~2,040 at 1080p for a ~4× CPU-cull speedup; per-fragment shader cost unchanged

## Shadow Pipeline

- Per-sprite `castsShadow` flag packed into `effectBuf0.x` system bits; `OcclusionPass` masks alpha by the per-instance flag
- `Sprite2D.shadowRadius` — per-sprite shadow radius with auto scale-derived default; stored in interleaved `instanceExtras.x`
- `SDFGenerator` and `OcclusionPass` wired into `Flatland` pipeline
- Shadow pipeline state moved to ECS trait + system (`shadowPipelineSystem`)
- `OcclusionPass` default resolution scale lowered to `0.5` for performance; out-of-range lights culled before occlusion upload
- 5-tap separable binomial blur enabled for smoother SDF transitions
- `Light2D.castsShadow` stored in `LightStore` row3.b; per-light shadow traces gated on the flag so fill lights pay no shadow-trace cost

## Instance Buffer

- Core per-instance data (UV, color, flip, system flags, enable bits, shadow radius) moved to a single `InstancedInterleavedBuffer` exposed via `instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras` views (64 B / 16 floats per instance)
- `effectBuf0+` is now pure `MaterialEffect` data with no reserved system slots, eliminating a latent clobber hazard
- `EffectMaterial.MAX_EFFECT_FLOATS = 12` (3 effectBufs × 4 floats); exceeding this cap throws a clear error at `registerEffect` time instead of failing at WebGPU pipeline compilation

## TSL Accessor Helpers

- New typed TSL helpers exported from `three-flatland/lights`: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, alongside existing `readShadowRadius()`, `readCastShadowFlag()`, `readReceiveShadowsFlag()`
- Helpers moved to `materials/instanceAttributes.ts`; `lights/` barrel now exports only `wrapWithLightFlags`
- No external import path changes

## Devtools Bus

- Debug bus/transport system: `DevtoolsProvider` over `BusTransport`, data routed through offload worker pool
- Stats producer with zero-alloc hot path, delta encoding, and env metadata; `DevtoolsProducer` extracted, stats removed from production path
- Debug protocol: subscribe/ack topics, bundled data packets, timestamps, server-side idle ping, consumer liveness check
- `DebugTextureRegistry`: registers `RenderTarget` and `DataTexture` entries, async GPU readback, thumbnail streaming
- Buffer subscription, effect field location, and resize invalidation added to debug protocol
- GPU timing detection; stats panel visibility gated on timer query availability
- Bus-worker resolved via extensionless URL to support both source (`bus-worker.ts`) and dist (`bus-worker.js`) consumer modes

## Other

- `channelNode` return type narrowed to the provided `ChannelNodeMap` shape
- Dev-time warning emitted when a required lighting channel provider is missing
- `Light2D.clone()` correctly propagates `castsShadow`
- Reservoir-based tile overflow by importance (lights beyond `MAX_LIGHTS_PER_TILE` use weighted reservoir sampling)
- Lighting ambient contributions, tilemap ambient, and material effect integration for tile layers

Comprehensive lighting release: Forward+ with hero/fill separation and per-category quotas, SDF-based shadow pipeline, interleaved instance buffer freeing WebGPU buffer slots, and a full devtools bus for in-browser pipeline inspection.
