# SDF Shadow Plumbing — Phase 2 (quad-resolution decoupled shadow atlas)

**Status:** Required. Must ship after Phase 1 validates the baseline inline trace.

**Rationale:** Phase 1 produces shadow values by tracing the SDF per-fragment, per-light. This is correct but wasteful: four pixels in a 2×2 quad usually traverse near-identical rays, and the inline trace runs inside the hot per-fragment light loop. HypeHype's SIGGRAPH 2025 *Stochastic Tile-Based Lighting* shows that decoupling the trace into a dedicated pass — evaluated once per 2×2 quad, packed into an 8-bit atlas, sampled back in the light loop — cuts shadow compute to ~1/4 while keeping visual parity (shadow perceptual resolution is much lower than lighting resolution).

This is the HypeHype technique applied to our 2D SDF-shadow pipeline. It is scoped as a standalone phase so it can be reviewed and landed atomically without entangling the baseline.

## Source material

- `planning/superpowers/specs/stochastic-tiled-lighting-evaluation.md` — the original research digest. Section 7 ("Shadows") describes the technique in HypeHype's words. Section 5.2 ("Quad-resolution decoupled shadow pass") is the adoption recommendation.
- `planning/experiments/SDF-Shadow-Plumbing.md` — Phase 1 tactical plan, lands the prerequisites this phase consumes.

## Goals

- Reduce shadow-sampling work in the light loop to ~1/4 of the naïve per-fragment trace.
- Keep shadow correctness: no visible degradation vs Phase 1 on static scenes.
- Preserve soft-shadow penumbra (Phase 1's IQ-style `min(softness * d / t)`) through the atlas.
- Stay within WebGPU + WebGL2 parity — no storage-buffer-only features.
- Zero-alloc hot paths, ECS-native state ownership (follow the `ShadowPipeline` trait precedent).

## Non-goals

- Stochastic sampling (HypeHype item E — gated on TAA, which we don't have)
- Proxy light clustering
- Hierarchical tile coarsening (HypeHype item D)
- Shadow cascades across multiple LOD tiers

## Architecture

### Shadow atlas render target

Half-resolution of the viewport — each 2×2 quad of screen pixels gets one shadow texel per relevant light. Same lifetime as `ShadowPipeline.sdfGenerator`: allocated on first frame, resized when the viewport changes, disposed with the pipeline.

Packing:
- 8-bit per shadow term (enough for penumbra — Phase 1 proves this visually).
- Per tile, store shadow for each of up to `MAX_LIGHTS_PER_TILE` lights as a 2D block: `(TILE_SIZE / 2)² × MAX_LIGHTS_PER_TILE` bytes per tile.
- Budget at 16-px tiles / 16 lights / 1920×1080 = `(16/2)² × 16 × (120×68)` = `64 × 16 × 8160` ≈ 8.3 MB. Higher than HypeHype's 0.5–2 MB budget because our tiles are smaller; revisit by widening tile size or compressing via delta encoding before landing.
- If budget is tight: halve tile-local shadow resolution (4×4 per 16-px tile) → ~2 MB.

### Decoupled shadow pass

New ECS system `shadowAtlasSystem` running after `shadowPipelineSystem` and before `lightEffectSystem`'s colorTransform assignment. For each on-screen tile × each light in that tile's Forward+ list:

1. Derive 2×2-quad world positions from the tile rect.
2. Sphere-trace the SDF (the same `shadowSDF2D` logic from Phase 1, but called from the compute/fragment of this pass, not the main light loop).
3. Write 8-bit shadow value into the atlas slot for `(tile, light, quad)`.

WebGPU path: compute shader with storage-texture writes.
WebGL2 fallback: fragment-shader pass rendering a quad per tile block, writing into a sub-rect of the atlas RT. Slower but fully supported.

### Light-loop consumer

Replace the inline `shadowSDF2D(...)` call in `DefaultLightEffect` (and `DirectLightEffect`) with an atlas sample:

```ts
const shadow = sampleShadowAtlas(
  shadowAtlas,
  tileIndex,
  lightSlot,
  localQuadUV
)
```

One texture sample instead of a 32-iteration loop. Bandwidth trades for compute — usually a big win in fragment-shader-heavy scenes.

### ECS shape

New trait `ShadowAtlas` (singleton):
- `renderTarget: RenderTarget | null`
- `width: number` / `height: number`
- `initialized: boolean`

New system `shadowAtlasSystem` — owns the trait lifecycle, runs the decoupled pass each frame when `ShadowPipeline.sdfGenerator` is non-null.

Flatland changes: zero. The system self-gates on the existing `ShadowPipeline` trait's presence and doesn't need new Flatland fields. This mirrors the Phase 1 refactor.

## Touchpoints

- **A1** — `ShadowAtlas` trait + factory in `ecs/traits.ts`
- **A2** — `shadowAtlasSystem` in `ecs/systems/`. Owns alloc, resize, per-frame pass, dispose.
- **A3** — Shadow-atlas TSL helper: `sampleShadowAtlas(atlas, tileIdx, lightSlot, quadUV)` returns `Node<'float'>`. Lives in `@three-flatland/nodes/lighting/shadows.ts` alongside `shadowSDF2D`.
- **A4** — `DefaultLightEffect` + `DirectLightEffect` switch from inline `shadowSDF2D` to `sampleShadowAtlas`. This replaces the Phase 1 call, not coexists with it. The inline helper stays exported for consumers that opt out of the atlas (e.g. unbatched standalone sprites).
- **A5** — Schedule: register `shadowAtlasSystem` after `shadowPipelineSystem`, before the sprite render pipeline.
- **A6** — Dev-time check: when `shadowAtlasSystem` hasn't run yet (pre-first-frame) consumers fall back to the inline `shadowSDF2D` so nothing renders black on frame 1.

## Acceptance criteria

- Visual parity with Phase 1 at all supported resolutions (manual compare on `examples/react/lighting`).
- Frame time reduction measurable at 16 lights / 8 casters / 1080p on the target hardware — expect ≥2× speedup on the light-loop phase.
- Atlas memory stays within the budget documented above (≤2 MB at 1080p).
- WebGL2 path renders correctly (may be slower, must not be broken).
- No per-frame allocations in the shadow-atlas system's hot path.
- ECS conventions: trait mutated in place, pre-resolved stores, no reverse maps.

## Out-of-scope for this phase

- Multi-sample shadow-atlas filtering (TAA/denoiser territory)
- Cascade LOD hierarchy across screen regions
- Stochastic light-slot sampling (HypeHype item E)

## Dependencies on Phase 1 being landed first

- `ShadowPipeline` trait must exist (✅ landed)
- `shadowSDF2D` helper must exist and be correct (✅ landed — it's the atlas pass's inner trace)
- `LightEffectBuildContext.sdfTexture` + `worldSize`/`worldOffset` threading (T5 — Phase 1 pending)
- `OcclusionPass` must be feeding `SDFGenerator` every frame (✅ landed)
- `ForwardPlusLighting` tile → light list must be stable (✅ — reservoir overflow landed)
- Visual baseline in `examples/react/lighting` must exist (T8 — Phase 1 pending)

## Sequencing

Phase 1 T5 → T7 → T8 land first. Measurements come off T8. Then this spec gets a measurement appendix, the budget assumptions get re-validated, and A1-A6 execute in order.
