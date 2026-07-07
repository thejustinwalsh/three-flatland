# Shadow Silhouette, SDF, and Forward+ Tile Polish

Focused correctness + ergonomics pass on the 2D lighting pipeline. Addresses
the three visible regressions reported against `DefaultLightEffect`:

1. Thin shadows — occluder silhouette collapses to a sliver or disappears
2. No penumbra widening — soft-shadow falloff reads as hard/binary
3. Ringing — Voronoi-seam artifacts amplified by the softness term and
   downstream cel-banding

Plus two Forward+ polish items flagged by the pipeline review that are
cheap and worth folding into the same branch:

4. Tile size should be compile-time adjustable (not runtime)
5. Tile texture should pack into a 2D grid, not a 4×tileCount strip
6. `lightDir.normalize()` hoisted out of the per-light shader loop

---

## Non-goals

- **No temporal accumulation, no blue noise, no history RT.** Blue noise
  without a history buffer is a modest cosmetic tradeoff (banding → grain).
  Queue it alongside the history RT work in a later branch.
- **No PCSS two-phase trace in this spec.** Tracking blocker distance is
  a separate follow-up. The fixes here make the *current* IQ min-ratio
  trace behave correctly — which it doesn't today because of (S1-S3).
- **No Shadow Atlas Phase 2 work.** That spec
  (`SDF-Shadow-Atlas.md`) stays unstarted and separate. This branch makes
  the per-fragment trace *correct* first; the atlas is an orthogonal perf
  layer on top.
- **No Forward+ bounding-sphere culling.** Identified as the single
  largest CPU win by the review, but higher risk — deferred to its own
  spec. Same for ReSTIR / proper WRS.

---

## Shadow fixes

### S1 — Signed SDF (root cause of "thin shadow")

**File:** `packages/three-flatland/src/lights/SDFGenerator.ts`

Today the SDF is unsigned: `dist = length(fragUV - seedUV)`. Inside an
occluder the field reports the distance to the *nearest edge*, not a
negative inside-value. The sphere trace in `shadowSDF2D` uses
`t += max(sdfWorld, eps)` with `eps = 0.5` world units. Consequence: a
ray aimed across a thin occluder reads a small positive distance, *steps
through the interior*, and exits on the far side before the `sdfWorld < eps`
hit predicate fires.

**Fix:** produce a signed field.

- Run JFA twice: once on the normal seed (outside distance), once on the
  inverted seed (inside distance).
- Final-pass RT writes `vec4(signedDist, dxOutside, dyOutside, 1)` where
  `signedDist = distOutside - distInside`.
- `shadowSDF2D` treats `signedDist < 0` as an immediate full-shadow
  terminator (ray originated inside an occluder or stepped inside during
  the trace).
- Keep the existing `eps` epsilon gating for the grazing-edge case where
  `signedDist` is tiny-positive but the ray is effectively blocked.

**Cost:** one extra JFA chain per frame. SDF generation doubles in cost,
but SDF generation is a small fraction of frame time and per-fragment
trace cost is unchanged.

**Alternative considered:** occluder-alpha dilation (1–2 texel expansion
before seeding). Cheaper, but only papers over the root cause — a
2-pixel-wide occluder after dilation is still vulnerable to inter-pixel
step-through in the trace. Signed SDF is the honest fix; dilation is
kept as an optional seed-side sharpening pass (S2).

---

### S2 — Occluder alpha dilation (optional, 1–2 texel)

**File:** `packages/three-flatland/src/lights/OcclusionPass.ts`
(or a new small pre-pass between OcclusionPass output and SDF seed)

After S1 lands, re-measure. If silhouettes of **small sprite occluders**
(<8 texels wide at half-res) still look underweight, add a 1-texel
max-dilation pass on the occlusion alpha before JFA seeding. Cheap,
preserves signed-SDF correctness, bulks thin silhouettes.

If S1 alone is sufficient, skip S2.

---

### S3 — Linear-filter the occlusion RT

**File:** `packages/three-flatland/src/lights/OcclusionPass.ts`

Occluder alpha is currently `NearestFilter`. Switching to `LinearFilter`
gives free anti-aliased silhouette edges going into JFA seeding — cheapest
ringing mitigation available.

Caveat: JFA itself needs nearest-filter inputs on the ping-pong RTs; that
stays as-is. Only the occlusion-pass *output* / JFA seed texture changes
filtering.

---

### S4 — Raise `startOffset`, stop reusing `shadowBias` for it

**File:** `packages/presets/src/lighting/DefaultLightEffect.ts:170`

Today the shader passes `shadowBias` (default `0.04` world units, via
pane slider range `0..4`) as `startOffset`. The first sample lands
*inside the casting sprite*. The IQ penumbra term then evaluates
`min(softness * 0.04 / 0.04, 1) = 1` immediately and clamps at 1 for
the rest of the walk. Penumbra collapses to hit/miss.

**Fix:**

- Rename/split in the schema: `shadowBias` (existing) stays as the IQ
  min-distance epsilon, default `0.5`.
- Add a new `shadowStartOffset` uniform, default `~1.5` world units
  (approx one tile at 32px textures, one caster radius). Pane range
  `0..8`, default `1.5`.
- `shadowSDF2D` is already parameterized — pipe both through.

With S1 in place, startOffset can safely be smaller because signed SDF
handles the "ray starts inside" case correctly. But keeping `startOffset`
at a genuine caster-scale value also gives the penumbra term a real
clear-span to integrate over. Both matter.

---

### S5 — Reorder quantize vs shadow

**File:** `packages/presets/src/lighting/DefaultLightEffect.ts`

Ambient is already post-quantize (shipped earlier in this branch). Extend
the same reasoning to the shadow gradient: don't let cel-banding quantize
the shadow term itself.

**Current shader:**

```
direct = totalLight + totalRim * rimIntensity   // includes per-light shadow
quantized = bands_quantize(direct)
return quantized + ambient
```

**Proposed:**

```
unshadowedDirect = (Σ per-light contribution·atten·diffuse) + rim
quantizedDirect = bands_quantize(unshadowedDirect)
shadowed = quantizedDirect · shadow_attenuator   // applied AFTER banding
return shadowed + ambient
```

This requires separating the shadow scalar from the direct contribution
accumulation. Options:

- Accumulate `totalLightUnshadowed` alongside `totalLight`, divide at
  end to recover a mean shadow factor. Cheap but approximate (doesn't
  preserve per-light shadow weighting).
- Move shadow multiply *outside* the tile loop: each light contributes
  `contribution · atten · diffuse` to one accumulator and
  `contribution · atten · diffuse · shadow` to another; the ratio is
  the per-pixel shadow scalar. More correct, same cost.

**Decision:** second option — accumulate both, shadow-scalar = ratio,
apply after banding. Preserves correctness of multi-light shadow mixing.

---

### S6 — Occlusion RT at full resolution (diagnostic)

**File:** `packages/three-flatland/src/lights/OcclusionPass.ts:114`
(`resolutionScale = 0.5`)

Temporarily set `resolutionScale = 1.0` for the duration of this spec
to remove half-res as a confounder during testing. After shadow
correctness is validated, re-enable `0.5` and verify the visual outcome.
If half-res still looks wrong post-fix, that's its own follow-up; if it
looks fine, keep the perf win.

---

## Forward+ polish

### F1 — Compile-time tile size

**Files:**
- `packages/three-flatland/src/lights/ForwardPlusLighting.ts`
  (`TILE_SIZE = 16`, `MAX_LIGHTS_PER_TILE = 16`)
- Preset consumers in `packages/presets/src/lighting/*.ts`

Review concluded that 16×16 is over-small for 2D sprite scenes (6,750
tiles at 1440×1200, 530 KB persistent buffers). 32×32 is a better default
(1,700 tiles, 4× fewer, negligible quality loss). But the right answer is
application-dependent — hence compile-time user-overridable.

**Proposed mechanism:**

- Export `DEFAULT_TILE_SIZE = 32` and `DEFAULT_MAX_LIGHTS_PER_TILE = 16`
  as module constants.
- Add constructor options to `ForwardPlusLighting`:
  ```ts
  constructor(options?: { tileSize?: number; maxLightsPerTile?: number })
  ```
- Default values pull from the module constants.
- `DefaultLightEffect`'s schema factory becomes
  `forwardPlus: () => new ForwardPlusLighting({ tileSize, maxLightsPerTile })`
  where `tileSize` and `maxLightsPerTile` are closure-captured from the
  factory call.
- Expose a named export per preset that accepts these opts:
  ```ts
  export const DefaultLightEffect = createDefaultLightEffect()
  export function createDefaultLightEffect(opts?: { tileSize?, maxLightsPerTile? })
  ```
  This matches the Koota-style factory pattern already used elsewhere and
  is "compile-time adjustable" from the user's perspective — set once at
  module init, never mutated per-frame.

**Validation:** constructor throws if `tileSize` is not a positive integer
power-of-two, and `maxLightsPerTile` is not a positive multiple of 4
(since shader-side packing requires 4-aligned blocks).

**Bump the default:** change `DEFAULT_TILE_SIZE` from `16` to `32` as
part of this spec. One-line user-observable change; measurably cheaper.

---

### F2 — 2D tile texture packing

**Files:**
- `packages/three-flatland/src/lights/ForwardPlusLighting.ts`
  (`_tileTexture` allocation, `createTileLookup`)
- `packages/presets/src/lighting/DefaultLightEffect.ts` (shader-side
  tileIndex decode)

Current layout:

```
width  = MAX_LIGHTS_PER_TILE / 4      (= 4 for MAX=16)
height = tileCount                    (= 90 × 75 = 6,750 at 1440×1200)
```

Tall/narrow. WebGPU's 2D texture hard limit is 8192 px — we're within spec
today, but a 1440×2160 viewport at 16-px tiles is 12,150 rows = overflow.
After F1 at 32-px tiles it drops to 3,038 rows, within spec, but still
uncomfortably near on larger canvases.

**Proposed 2D packing:**

Pack tile blocks into a roughly-square texture. Given
`blocksPerTile = MAX_LIGHTS_PER_TILE / 4` and `tileCount = tcX * tcY`,
total texel count is `tileCount * blocksPerTile`. Choose
`textureWidth = nextPow2(ceil(sqrt(totalTexels)))` and
`textureHeight = ceil(totalTexels / textureWidth)`.

CPU-side write: linear index `i = tileIndex * blocksPerTile + blockIndex`,
`x = i % textureWidth`, `y = i / textureWidth`.

Shader-side lookup (`createTileLookup` return): given `tileIndex` and
`slotIndex`, compute
```
blockOffset  = slotIndex / 4
elementOffset = slotIndex % 4
i = tileIndex * blocksPerTile + blockOffset
x = i % textureWidth
y = i / textureWidth
sample = textureLoad(tileTexture, ivec2(x, y))
```
`textureWidth` and `blocksPerTile` enter the shader as uniforms (already
have `tileCountXNode` and `screenSizeNode` — add `tileTextureWidthNode`
and `blocksPerTileNode` in the same style).

**Note on stable refs:** keep the `DataTexture` instance reference stable
across resize — reallocate the underlying `Float32Array` and reassign
`image.data`/`width`/`height`, don't swap textures. Same pattern the
current code already uses.

---

### F3 — Hoist `lightDir.normalize()` out of spot cone math

**File:** `packages/presets/src/lighting/DefaultLightEffect.ts:138`

`Light2D._direction` is normalized on every setter call
(`Light2D.ts:162, :205`). It's uploaded into `row2.rg` via `LightStore`
already normalized. The shader-side re-normalize inside the tile loop is
redundant per-fragment work.

**Fix:** replace `lightDir.normalize()` with `lightDir` in the spot-cone
`toSurfaceNorm.dot(...)` expression. Similarly audit any other `.normalize()`
on inputs that are already normalized upstream.

Confirm: `LightStore.writeLightData` does not strip normalization, and
does not re-encode through quantization that could denormalize. If there's
any precision risk from RGBA32F round-trip, cap it at a single
`.normalize()` *outside* the tile loop on the per-light var, not per-dot-
product.

Expected saving: two TSL ops per lit pixel per light. Small on its own,
but free and correctness-neutral.

---

## Order of work

Touchpoints are independent in principle; recommended order prioritizes
fastest user-visible signal.

1. **S3** (linear filter occlusion) — one-line change, likely a visible
   silhouette quality bump on its own. ~5 min.
2. **S4** (split `shadowBias` / `shadowStartOffset`, raise offset default)
   — pane schema update + uniform split. ~30 min.
3. **S1** (signed SDF) — second JFA chain, final-pass subtraction, trace
   interpretation update. ~2–3 hours. This is the real fix.
4. **S5** (shadow post-quantize) — accumulator split in the shader. ~1
   hour.
5. **S6** (`resolutionScale = 1.0`) — measure regressions caused by
   half-res after S1-S5 land. Flip back if nothing visible. ~15 min.
6. **S2** (occluder dilation) — only if thin sprites still look underweight
   after S1. Skippable.
7. **F3** (`lightDir.normalize()` hoist) — unrelated, trivial, fold into
   the same PR. ~10 min.
8. **F1** (compile-time tile size) — factory API + default bump 16→32.
   ~1 hour.
9. **F2** (2D tile texture packing) — shader-side decode change +
   CPU-side pack, plus test across a range of viewport sizes. ~2 hours.

Estimated total: 6–8 hours of focused work.

---

## Validation

Manual:

- Dungeon demo — wall torches should cast **visible full-width
  silhouettes** behind the hero / knights / slimes, with a **soft
  gradient penumbra that widens at distance from the caster**.
- Confirm ringing is gone by disabling bands (`quantize: false`) and
  inspecting a single torch's shadow gradient — should be smooth.
- Re-enable bands and confirm shadow gradient is *not* stepped, only
  the direct light is.

Automated:

- Existing `shadow-pipeline.test.ts` should still pass.
- Add a small test: signed-SDF values inside a known-placed occluder
  read negative; outside read positive matching UV-space distance.
- Add test: `ForwardPlusLighting` constructor honors `tileSize` opt,
  throws on invalid values.

Performance:

- Measure occlusion + JFA + shadow-trace pass cost before/after S1
  (doubled JFA, unchanged trace). Expected regression <0.5 ms at 1440×1200
  on M-series GPU.
- Measure CPU `ForwardPlusLighting.update` before/after F1 default bump
  16→32 — expected 2–4× speedup of the CPU culling loop at typical light
  counts.
- Measure shader-side lookup cost before/after F2 — expected flat
  (same textureLoad op, different coord math).

---

## Files touched (summary)

| File | Change |
|---|---|
| `packages/three-flatland/src/lights/OcclusionPass.ts` | S3 (linear filter), S6 (full res) |
| `packages/three-flatland/src/lights/SDFGenerator.ts` | S1 (signed SDF via dual JFA) |
| `packages/nodes/src/lighting/shadows.ts` | S1 (negative-distance terminator), S4 (rename params) |
| `packages/presets/src/lighting/DefaultLightEffect.ts` | S4 (uniform split), S5 (shadow post-quantize), F3 (normalize hoist) |
| `packages/three-flatland/src/lights/ForwardPlusLighting.ts` | F1 (constructor opts, defaults), F2 (2D packing) |
| `packages/presets/src/lighting/*LightEffect.ts` | F1 (factory form) |
| `examples/react/lighting/App.tsx` | pane schema update (split bias/offset) |

Test files:

| File | Change |
|---|---|
| `packages/three-flatland/src/shadow-pipeline.test.ts` | signed SDF assertions |
| `packages/three-flatland/src/forward-plus.test.ts` | constructor opt validation (new) |
