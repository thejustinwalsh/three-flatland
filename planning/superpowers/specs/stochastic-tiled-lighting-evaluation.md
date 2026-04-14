# Stochastic Tile-Based Lighting — Evaluation vs. PR #17 Forward+

**Date:** 2026-04-13
**Scope:** Research-only. Evaluates SIGGRAPH 2025 *Stochastic Tile-Based Lighting in HypeHype* (J. Lempiäinen) against the current 2D lighting system in PR #17 (`feat-lighting-postprocess-flatland`). Recommends targeted adoptions for issues #12, #14, #16.

## 1. Source material

- HypeHype STB talk notes: https://advances.realtimerendering.com/s2025/content/s2025_stb_lighting_v1.1_notes.pdf
- Related: MegaLights (UE5), same session — https://advances.realtimerendering.com/s2025/content/MegaLights_Stochastic_Direct_Lighting_2025.pdf

## 2. STB algorithm summary

Two-stage screen-space tile pipeline. No 3D clusters required.

| Stage | Tile size | Output | Cost model |
|---|---|---|---|
| Big-tile SRS | 128×128 px | 16 unique lights/reservoir via A-Chao 1-sample-stream × 16 | Scene-wide constant (~0.02 ms for 500 lights) |
| Small-tile resample | Interleaved 32×32 footprint (covers 256 px) | 1–4 lights/pixel | Fixed-cost per pixel |
| Decoupled shadow | 2×2 quad resolution | 8-bit shadow atlas, dynamic pow-2 tiles | 0.5–2 MB @ 1080p |
| Lighting | Per-pixel | BRDF accumulation over 1–4 lights | Fixed cost |

- **Big-tile PDF**: omni illuminance at nearest point on min/max-depth segment of tile — non-zero everywhere (unbiased).
- **Small-tile PDF**: shadowed illuminance × cheap Lambert+Blinn-Phong averaged over 4-of-64 quad points. Monochromatic (luminous-efficiency) to cut VGPR.
- **Stratification**: K parallel reservoir streams with a randomized per-iteration modulo offset seeded from big-tile index. Guarantees uniqueness without replacement.
- **Denoiser**: TAA. Temporal splotch flicker is **acknowledged as unresolved**.
- **Hardware target**: pixel-shader-only (budget mobile). No compute, no atomics, no wave intrinsics.

## 3. Current PR #17 snapshot

From `packages/three-flatland/src/lights/` and `packages/nodes/src/lighting/`:

- `TILE_SIZE = 16` px (`ForwardPlusLighting.ts:5`)
- `MAX_LIGHTS_PER_TILE = 16` (`ForwardPlusLighting.ts:6`)
- Max 256 lights global (`LightStore.ts:59`, configurable)
- DataTexture storage, ivec4 packing (RGBAFormat/FloatType)
- Per-fragment `Loop(16)` with sentinel-zero early-out (`DefaultLightEffect.ts:98–102`)
- **Overflow**: silently skip at light #17 (`ForwardPlusLighting.ts:106`)
- **No importance sorting** — submission order
- **No SDF tile culling** — brute-force CPU assigns all lights to all tiles
- **SDF shadow uniforms present but not wired** (`DefaultLightEffect.ts:66–68`, TODO at 155)
- **No TAA, no history buffers, no motion vectors**

Known gaps per planning docs: proxy light clustering, SDF occlusion test, cascade merging, attenuation early-out.

## 4. Applicability to 2D

**Algorithm is 2D-compatible.** STB is screen-space tile, not cluster-based. In 2D:
- Big-tile PDF collapses: segment → single depth plane, distance metric becomes light-vs-tile-AABB.
- Small-tile BRDF term works with flat or sprite-derived normals.
- Shadow atlas idea maps cleanly onto the existing `SDFGenerator` output.

**But the motivating problem doesn't match.** STB's two-stage rig earns its complexity against unbounded scene light counts (hundreds to thousands). With a 256-global / 16-per-tile envelope, single-pass Forward+ is already cache-coherent and cheap. And STB depends on TAA — which this project does not have.

## 5. Recommended adoptions (ranked)

### 5.1 Reservoir-based tile-overflow ordering  [adopt]
Replace "silently skip at light #17" with a 16-slot importance reservoir keyed on `illuminance_at_tile_center × enabled`. Eliminates tile-edge flicker when the cap is hit — which is the specific artifact STB exists to fix, without needing stochastic shading.

- Scope: ~20 lines in `ForwardPlusLighting.ts:98–114`
- Risk: low — pure CPU-side sort, deterministic
- Fits issue #12

### 5.2 Quad-resolution decoupled shadow pass  [adopt]
Evaluate SDF sphere traces once per 2×2 quad into an 8-bit atlas, then sample in the light loop. STB's core bandwidth-saving idea, orthogonal to stochastic sampling, directly applicable to 2D SDF shadows.

- Scope: new pass between `SDFGenerator` and fragment lighting
- Expected win: ~4× reduction in SDF trace work
- Fits issues #11 and #14

### 5.3 Per-tile illuminance-based early cull  [adopt]
Use a cheap 2D light-vs-tile-AABB illuminance score to drop lights below a threshold *before* tile list insertion. The planning docs describe SDF-aware culling; this is a simpler prerequisite that works without SDF.

- Fits issue #12 planning doc (Hybrid-SDF-Shadow-System.md Phase 3)

### 5.4 Hierarchical tile coarsening (128/32 two-stage)  [defer]
Only worth it if raising the global cap beyond ~1k lights and once TAA lands.

### 5.5 Full stochastic 1–4-lights-per-pixel sampling  [defer]
Requires TAA. Flickers visibly without it. Own team admits splotch problem is open.

## 6. What not to adopt

- fp16 light storage — no benefit at 256-light scale on WebGPU, adds precision bugs
- 8-bit shadow packing — payoff only at thousands of lights
- Stratified reservoir sampling in the fragment shader — defeats the purpose at our scale

## 7. RFC follow-through (issue #16)

Add a "Stochastic extension" appendix to `planning/experiments/Unified-2D-Lighting-Architecture.md` capturing:

1. Reservoir overflow as the default Forward+ overflow policy
2. Quad-resolution decoupled SDF shadow pass as part of the SDF→lighting integration
3. Stochastic per-pixel sampling as a v2 scaling path, gated on TAA

## 8. Open questions

- Does three-flatland intend to ship a TAA pass? If yes, timeline matters — it gates the v2 stochastic path.
- What's the actual target scene scale? If ≤256 lights is the ceiling, STB is over-engineered; if ambition is 1k+, the big-tile stage becomes attractive.
- MegaLights takes the compute/RT path — do we want a WebGPU-compute-only "pro" strategy behind the `LightingStrategy` interface (#14)?
