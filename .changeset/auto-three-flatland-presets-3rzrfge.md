---
"@three-flatland/presets": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## DefaultLightEffect

- SDF shadow tracing wired end-to-end: `shadow = float(1.0)` stub replaced with `shadowSDF2D` call; controlled by `shadowStrength`, `shadowSoftness`, `shadowBias`
- `shadowStartOffset` tunable uniform (replaced hardcoded 40-unit escape constant); `shadowStartOffsetScale` effect-level multiplier on per-sprite `shadowRadius`
- Shadow applied after cel-band quantization — shadow edges remain smooth when `bands > 0`
- Removed `shadowBands` / `shadowBandCurve` uniforms (superseded by post-quantization shadow application)
- `shadowPixelSize` and `bands` / `bandCurve` remain for retro pixelated look
- Per-light `castsShadow` gate: 32-tap SDF trace skipped for lights with `castsShadow: false`
- Skip shadow trace when attenuation ≤ 0.01 (sub-visible, no perceivable contribution)
- Per-category fill-light quota and compensation shader: 4-way TSL select keyed on `Light2D.category` bucket
- Dropped per-tile `fillScale` shader multiply (tile-boundary brightness banding); fill lights contribute at natural intensity, with CPU-side compensation data preserved for a future temporal path
- Removed redundant `lightDir.normalize()` inside spot-cone loop (unit-length invariant upheld at `Light2D.direction` set-site)

## DirectLightEffect

- SDF shadow tracing wired (`needsShadows: true`); mirrors `DefaultLightEffect` T7 wiring

## Exports

- `@three-flatland/presets` gains a `./react` subpath export; `@react-three/fiber` declared as optional peer dependency

Removed `AutoNormalProvider`, `NormalMapProvider` (replaced by `NormalMapLoader` in `@three-flatland/normals`). `TileNormalProvider` retained.

### 7eb987c66761db7e63cfce2d19ab5453fd93789e
feat: enhance Forward+ lighting with per-category fill quotas and shader rebuild optimizations
Files: examples/react/lighting/App.tsx, examples/three/lighting/main.ts, examples/three/lighting/public/maps/dungeon.ldtk, examples/three/lighting/public/sprites/Dungeon_Tileset.normal.json, examples/three/lighting/public/sprites/Dungeon_Tileset.normal.png, examples/three/lighting/public/sprites/slime.json, examples/three/lighting/public/sprites/slime.png, examples/three/pass-effects/main.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/SimpleLightEffect.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/lights/LightStore.test.ts, packages/three-flatland/src/lights/LightStore.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/effectFlagBits.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 21 files changed, 3761 insertions(+), 975 deletions(-)

### e2dcc1d1fcaea8165f4746c5b47c451d1c9b67cb
fix: drop per-tile fillScale shader multiply (tile-aligned banding)
Per-tile fill-light compensation produced visible tile-boundary
brightness steps because the same lights are scaled differently in
adjacent tiles when in-range/kept counts diverge across the
boundary (e.g., one slime overlaps tile A but not tile B → tile A
has fillScale=1.5 while B has 1.0 → 50% step at the boundary).

User-visible regression: even at 2-3 overlapping fills, dense slime
scenes show grid-aligned brightness banding (the "checkerboard")
instead of smooth illumination.

Fixing this cleanly requires temporal accumulation (history RT) so
the per-frame discontinuity averages out — out of scope for this
branch (non-goal in the polish spec).

This commit drops the shader-side fillScale multiply. Kept fills
contribute at their natural intensity; culled fills are absent.
Result: a small smooth dimming in dense fill clusters rather than
visible tile banding.

CPU-side compensation tracking is intact — fillCount, fillInRange,
and the per-category fillScales are still computed and written to
the tile meta texel each frame. Devtools can inspect them, and a
future temporal/bilinear compensation path can wire back into the
shader by re-introducing the multiply through tileMetaLookup.

The rest of the per-category infrastructure (importance, quota,
hero/fill bucketing, hashed category strings) stays — those still
do useful work bounding shader cost and preventing fills from
evicting torches. We just stop trying to recover absolute
luminance through per-tile scalars.
Files: packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 1 file changed, 21 insertions(+), 34 deletions(-)

### d3680bddef77cf40c02a82a5184ce88e7380eb6e
feat: per-category fill-light quotas via hashed category string
Scene-level fix for the mixed-fill failure mode: with a single fill
bucket, two distinct fill types (green slime glow + blue water
ripple) competed for the same 2-slot quota per tile, and the
fillScale compensation averaged their contributions incorrectly when
the survivors weren't a representative sample of the culled set.

Now every fill-light category hashes to its own bucket, so each
category has independent quota + compensation:

- `Light2D.category?: string` — hashed via djb2 (pure JS, one-time at
  set-site, cached module-level per unique string) to a 2-bit bucket
  index (0..3). Default undefined → bucket 0, matching today's
  single-bucket behavior bit-for-bit. Pattern mirrors native web
  platform primitives: async crypto.subtle dwarfs djb2 for short
  strings, and per-frame lookups hit a Map so repeat strings skip
  djb2 entirely.

- `LightStore` row 3 column A now carries the hashed bucket index
  (was reserved). Shader reads it per-light via row3.a.

- `ForwardPlusLighting` tracks per-tile per-category counters:
  - `_tileSlotCategory` (Int8Array) — -1 for hero slots, 0..3 for
    fill slots tagged by bucket.
  - `_tileFillCount` / `_tileFillInRange` now shape
    [tileCount * FILL_CATEGORY_COUNT], one bucket per 4-wide stripe.
  - Assignment logic scoped per-category: quota is 2 per bucket, and
    eviction only competes within the same bucket. Heroes still
    never evict fills; fills never cross-bucket either.
  - Compensation pass emits 4 fillScales per tile meta texel
    (meta.x/.y/.z/.w), one per bucket.

- `DefaultLightEffect` shader selects the right compensation scale
  per-light via a 4-way TSL select keyed on row3.a. Cost: 3 extra
  float selects per light per fragment when a fill light is
  evaluated; branch-free, small conditional chain.

- Demo: slime lights tagged `category="slime"`. Torches stay hero
  (no category). If a future light adds `category="water"` etc.,
  each gets its own quota.

New helper: `categoryHash.ts` — djb2 + module-level Map<string,
bucket> cache. djb2 runs once per unique string ever; subsequent
lookups are native-hashed Map hits (V8 caches string hashCodes
internally). Per-frame hash cost: zero, since Light2D caches the
bucket integer at property-set time.

Tests: 7 new Light2D cases (category default, bucket caching,
cross-instance reuse, setter re-hash, getUniforms round-trip, clone
preservation, bucket range validation); 7 new categoryHash tests
(determinism, range, null/undefined/empty handling); 1 new
ForwardPlus test asserting distinct categories get independent
quotas and per-bucket compensation scales. Existing tests updated
to reflect the per-category meta-texel layout (all 4 channels
fallback to 1.0 when unused).
Files: examples/react/lighting/App.tsx, packages/presets/src/lighting/DefaultLightEffect.ts, packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/Light2D.test.ts, packages/three-flatland/src/lights/Light2D.ts, packages/three-flatland/src/lights/LightStore.ts, packages/three-flatland/src/lights/categoryHash.test.ts, packages/three-flatland/src/lights/categoryHash.ts
Stats: 9 files changed, 399 insertions(+), 85 deletions(-)

### 7a5ab916b5aa4a607f69796c70019f42e046d433
feat: fill-light quota + importance + compensation for dense clusters
Solves the failure mode where 1000-slime scenes could starve hero
lights (torches) out of tile-slot competition. Hero lights now bypass
the dedup path entirely; fill lights (castsShadow: false) are capped
at 2 per tile with per-tile compensation scaling so culled fills
don't visibly dim the scene.

Changes:

1. Light2D.importance (default 1.0) — multiplicative bias on the
   tile-ranking score. Hero lights (torches) set to 10 in the demo
   so they resist eviction by dense cosmetic clusters.

2. Tile storage layout bumped from stride=4 to stride=8:
     - texels 0..3: light indices (BLOCKS_PER_TILE = 4)
     - texel 4: meta — fillScale in .x, 3 reserved channels
     - texels 5..7: reserved
   Rationale: 128 B per tile aligns to cache lines on all target
   GPU classes (mobile, desktop, console); 3 spare meta slots avoid
   a future stride refactor. Max tiles drops from 65,536 to 32,768 —
   still covers up to ~8K CSS canvas at TILE_SIZE=32.

3. Forward+ assignment splits heroes/fills:
     - Hero lights (castsShadow=true): compete in global pool as
       before. Never evicted by fills.
     - Fill lights (castsShadow=false): capped at
       MAX_FILL_LIGHTS_PER_TILE (2). Additional in-range fills
       bump a counter but claim no slot. Fills displace only other
       fills within the quota.

4. Per-tile compensation: after assignment, compute
   fillScale = inRange / kept for each tile, write into the meta
   texel. Shader multiplies this into non-shadow-casting light
   contributions to preserve total luminance when dedup culled
   siblings. Safe because fill lights don't cast shadows — over-
   amplifying their contribution doesn't break shadow geometry
   (there isn't any).

5. DefaultLightEffect reads tileMeta.x (fillScale) once per
   fragment and conditionally multiplies it into the per-light
   baseContribution based on that light's castsShadow flag.

6. Demo: torches tagged importance={10}; slime lights unchanged
   (castsShadow={false} puts them on the dedup path).

Revert TILE=8 bump — dedup bounds the damage from dense clusters,
so MAX_LIGHTS_PER_TILE stays at 16 for dense hero-light scenes
(boss rooms, candlelit halls).

Tests: 7 new cases covering importance bias, fill quota, fillScale
math, hero/fill isolation, and the no-fills-in-range fallback.
Files: examples/react/lighting/App.tsx, packages/presets/src/lighting/DefaultLightEffect.ts, packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/Light2D.test.ts, packages/three-flatland/src/lights/Light2D.ts
Stats: 6 files changed, 417 insertions(+), 47 deletions(-)

### f96a13b07aad2a16806a1aed229d2bf00f205742
refactor: add readFlip/readSystemFlags/readEnableBits/readLitFlag helpers
Mirrors the pattern established by readShadowRadius / readCastShadowFlag
— every named field on the interleaved core buffer and extras buffer
now has a typed TSL helper so shader code doesn't repeat the
underlying attribute name + component index.

New helpers:
- readFlip()          → vec2 at instanceSystem.xy
- readSystemFlags()   → int at instanceSystem.z (raw bitfield)
- readEnableBits()    → int at instanceSystem.w (MaterialEffect bits)
- readLitFlag()       → bool, bit 0 of system flags

Existing helpers (readReceiveShadowsFlag, readCastShadowFlag,
wrapWithLightFlags) refactored to delegate to readSystemFlags /
readLitFlag for DRY.

Migrated three consumers off raw `attribute(...)` reads:
- Sprite2DMaterial colorNode — flip math uses readFlip()
- OcclusionPass colorNode — same
- NormalMapProvider channelNode — same (removed the `as unknown as`
  cast that was working around the previous raw read)

All helpers re-exported via `three-flatland/lights` index.

Keeps the internal packed layout refactorable in one file
(`wrapWithLightFlags.ts`) without having to chase down
component-index accesses scattered across the codebase.
Files: packages/presets/src/lighting/NormalMapProvider.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/lights/wrapWithLightFlags.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts
Stats: 5 files changed, 118 insertions(+), 66 deletions(-)

### 81a71dad9ba36083e1b48642b463e46236267237
refactor: interleave core instance data, effectBuf* pure effect
Core per-instance data (UV, color, flip, system flags, enable bits,
shadowRadius, reserved extras) now lives in a single InstancedInter-
leavedBuffer exposed via four attribute views: instanceUV,
instanceColor, instanceSystem, instanceExtras. effectBuf0+ is pure
MaterialEffect data with no reserved slots.

Why: SpriteBatch sat exactly at WebGPU's maxVertexBuffers=8 cap
(3 geometry + instanceMatrix + instanceUV/Color/Flip + effectBuf0),
leaving no room for additional per-instance data. Moving UV/Color/
Flip into an interleaved buffer collapses 3 bindings into 1, freeing
3 slots for effectBuf growth. Additionally, the prior layout
reserved effectBuf0.x/.y (and recently .z) for system data — a
latent collision hazard since the effect-field allocator also
started at offset 2, which would have clobbered shadowRadius the
first time any effect gained a per-instance uniform.

Layout (64 bytes / 16 floats per instance):
  instanceUV      offset 0   (x, y, w, h)
  instanceColor   offset 4   (r, g, b, a)
  instanceSystem  offset 8   (flipX, flipY, sysFlags, enableBits)
  instanceExtras  offset 12  (shadowRadius, reserved, reserved, reserved)

Effect-slot allocator now starts at offset 0. EffectMaterial adds
static MAX_EFFECT_FLOATS = 12 (3 effectBufs × 4 floats) and throws
a clear error at registerEffect when cumulative effect data would
exceed this cap, instead of letting WebGPU reject the pipeline at
draw time.

Public API unchanged — Sprite2D.shadowRadius, sprite.castsShadow,
readCastShadowFlag(), readShadowRadius(), addEffect() all behave
identically; only internal attribute names and offsets shifted.

See planning/superpowers/specs/2026-04-23-interleaved-instance-
buffer-design.md for the full design.
Files: packages/presets/src/lighting/NormalMapProvider.ts, packages/three-flatland/src/ecs/systems/batchAssignSystem.ts, packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/ecs/systems/bufferSyncSystem.ts, packages/three-flatland/src/ecs/systems/entityLifecycle.test.ts, packages/three-flatland/src/ecs/systems/transformSyncSystem.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/wrapWithLightFlags.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/MaterialEffect.test.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts, packages/three-flatland/src/pipeline/SpriteBatch.test.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts, packages/three-flatland/src/pipeline/SpriteGroup.test.ts, packages/three-flatland/src/sprites/Sprite2D.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 17 files changed, 593 insertions(+), 407 deletions(-)

### e2423f86079ebb9042f7ddc533801d1892fc6fc7
feat: per-sprite shadowRadius with auto scale-derived default
Replaces the scene-wide shadowStartOffset uniform (~40 world units
to cover the largest caster) with per-instance occluder radii. Each
sprite's own size drives its shadow escape distance — the knight
(64u) gets 64, the slime (32u) gets 32, tilemap walls use their tile
size, and a future 200u boss would auto-size to 200 without touching
any slider.

Data path:
- New core InstancedMesh attribute `instanceShadowRadius` on
  SpriteBatch and TileLayer (1 float per instance).
- Standalone Sprite2D geometry carries the same attribute so the
  shader compiles for both paths.
- transformSyncSystem resolves per-frame: `sprite.shadowRadius ??
  max(|scale.x|, |scale.y|)`. Auto tracks scale changes (incl.
  AnimatedSprite2D frame-source-size swaps) at no extra sync cost.
- New `readShadowRadius()` TSL helper pulls the attribute in
  shaders.

Sprite2D API:
- `shadowRadius?: number` option + field. `undefined` (default) =
  auto; user assigns a number to override (e.g., for sprites with
  transparent padding where the visible body is tighter than the
  quad bounds, or for drop-shadow-style effects where the
  user-perceived occluder size differs from scale).
- Preserved across `clone()`.

Effect wiring:
- `DefaultLightEffect.shadowStartOffsetScale` (default 1.0)
  replaces the old `shadowStartOffset` uniform as an effect-level
  multiplier on the per-instance radius. Other shadow-aware
  effects (future shadow maps, AO) consume the same per-instance
  value with their own semantics.
- Demo pane slider becomes a 0–3 multiplier with default 1.0.

Tests: 6 new Sprite2D cases covering default undefined, explicit
override, auto-resolve with negative scale (flips), setter round-
trip with undo back to auto, clone preservation for both explicit
and auto states.
Files: examples/react/lighting/App.tsx, packages/presets/src/lighting/DefaultLightEffect.ts, packages/three-flatland/src/ecs/systems/transformSyncSystem.ts, packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/lights/wrapWithLightFlags.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts, packages/three-flatland/src/sprites/Sprite2D.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/sprites/types.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 10 files changed, 266 insertions(+), 18 deletions(-)

### 709348dd718744e4f0548c0279a51af996a5820d
fix: raise shadowStartOffset default to 40 to match caster scale
The 1.5 default from the polish spec assumed smaller sprites than
the demo actually uses (knight body is 64 world units). At 1.5 the
trace's first samples land back inside the knight silhouette,
producing self-shadow on the hero, and land in the Voronoi-seam
zone adjacent to silhouette edges, producing shadow-edge ringing.

The old unsigned-SDF path hardcoded escapeOffset = 40 precisely
because it cleared the knight's radius with margin. Restoring 40
as the new default keeps the demo artifact-free out of the box
while still letting users tune the slider for scenes with smaller
or larger casters. The schema comment, the shadowSDF2D docstring,
and the pane slider range are all updated to reflect that this is
a caster-scale parameter, not a hit-epsilon micro-value.
Files: examples/react/lighting/App.tsx, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 3 files changed, 15 insertions(+), 12 deletions(-)

### 7a5c6b57e4393013f8685316d568d46801eda06e
feat: tunable shadowStartOffset uniform, drop 40-unit magic
Replaces the hardcoded `escapeOffset = float(40)` in shadowSDF2D
with a `startOffset: FloatInput` option. DefaultLightEffect adds a
matching `shadowStartOffset` schema uniform (default 1.5 world
units) and threads it through. The lighting demo exposes the
slider alongside the existing bias / maxDistance controls.

Signed SDF (from the previous commits) makes the smaller default
safe — the trace can detect 'ray started inside a caster' directly
via `sdf < 0`, so the start offset only needs to clear the caster's
radius rather than guess conservatively at sprite scale. 1.5 covers
typical sprite casters; scenes with larger bodies can dial up the
slider from the pane.

Also splits the previously-overloaded `shadowBias` semantics:
`shadowBias` stays as the IQ hit epsilon, `shadowStartOffset`
handles the self-shadow escape. Neither can mask the other.
Files: examples/react/lighting/App.tsx, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 3 files changed, 29 insertions(+), 2 deletions(-)

### a1eae1d0c9b2f6633516be9b5a2ae5f5197eb78f
refactor: remove shadowBands/shadowBandCurve — obsoleted by S5
The previous commit applies shadow post-quantization, so the
per-light shadow value no longer needs a separate 'bit-crush' pass
to avoid being cel-banded by the main `bands` uniform. The retro
blocky shadow look remains available via `shadowPixelSize` (world-
unit snap on the trace origin). No other consumer referenced the
removed uniforms.

Removes 2 schema uniforms, 2 uniform bindings, ~15 lines of per-
light shader math, and the corresponding demo prop plumbing and
pane inputs.
Files: examples/react/lighting/App.tsx, packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 2 files changed, 1 insertion(+), 39 deletions(-)

### f7acbd703298ed4fddc240f961b7c4df3c587392
fix: apply shadow after cel-band quantization, not before
Splits the tile-loop direct-light accumulator into unshadowed and
shadowed sums. `bands` now quantizes the unshadowed direct, and the
per-pixel shadow scalar is recovered as the ratio of shadowed to
unshadowed (weighted by each light's contribution) and applied AFTER
the quantize. Result: cel-banding stair-steps the direct gradient
but leaves the shadow edge smooth — fixes the stepped-shadow
artifact visible when `bands > 0`.

Secondary behavior change: rim lighting now inherits the same
per-pixel shadow ratio as direct. Previously rim was unshadowed.
Rim is opt-in (default `rimIntensity = 0`), so this is only
visible when a scene explicitly enables it — and physically more
correct (rim from an occluded light should itself be occluded).
Files: packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 1 file changed, 41 insertions(+), 11 deletions(-)

### 79018d276c492000e3721e700902499b1bf11506
perf: drop redundant lightDir.normalize() in spot cone math
Light2D._direction is normalized at every set-site (constructor +
direction setter) and the RGBA32F DataTexture upload preserves the
unit-length invariant, so the shader-side .normalize() on lightDir
was redundant work inside the per-tile per-light loop. Skipping it
saves a rsqrt + 2 muls per fragment per spot light with no behavior
change.
Files: packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 1 file changed, 5 insertions(+), 2 deletions(-)

### 40f8080d3a44b923fccbe87ac69d939efa29fbfe
perf: gate shadow trace on per-light castsShadow flag
Reads row3.b from the lights DataTexture and adds a fourth runtime
gate to shouldTrace so the 32-tap SDF trace is skipped for lights
marked castsShadow: false. Complements the ambient, N·L, and atten
gates. For scenes with many cosmetic lights (slime glows, atmospheric
fills), shadow cost collapses to O(casting lights) instead of
O(total lights).
Files: packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 1 file changed, 12 insertions(+), 7 deletions(-)

### c3095f7fbbd15ecb341412d2086b9023fed76c15
perf: skip shadow trace when atten is sub-visible
Adds a third runtime gate to shouldTrace in DefaultLightEffect so the
32-tap SDF trace is skipped when atten <= 0.01. The threshold sits
below 8-bit channel quantization, so a trace we skip here couldn't
have produced a visible pixel delta. In dense multi-light scenes a
large fraction of per-tile iterations are near-miss contributions at
the edge of their attenuation curve; skipping their traces is free
perf.
Files: packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 1 file changed, 10 insertions(+), 4 deletions(-)

### e3238bca08b2e6b90c267a5b9e831d68d4e675dc
refactor: remove unused lighting providers and loaders; update lighting tests and tilemap types
Files: packages/nodes/src/lighting/index.ts, packages/presets/src/lighting/AutoNormalProvider.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/DirectLightEffect.ts, packages/presets/src/lighting/NormalMapProvider.ts, packages/presets/src/lighting/TileNormalProvider.ts, packages/presets/src/lighting/index.ts, packages/presets/src/react/types.ts, packages/three-flatland/package.json, packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TiledLoader.ts, packages/three-flatland/src/tilemap/index.ts, packages/three-flatland/src/tilemap/types.ts
Stats: 14 files changed, 192 insertions(+), 1557 deletions(-)

### c227ab4942cee2a203e734be02c14b5119bdef85
feat: enhance debug protocol with buffer subscription and effect field location
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, packages/devtools/src/buffers-modal.ts, packages/devtools/src/buffers-view.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/devtools-client.ts, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/TileNormalProvider.ts, packages/presets/src/lighting/index.ts, packages/presets/src/react/types.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/bus-pool.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 22 files changed, 673 insertions(+), 221 deletions(-)

### b99f7188a69b2e2ef31aef059d7d7bc43ea4599f
feat: add shadow pixel size, bands, and band curve to lighting effect
Files: examples/react/lighting/App.tsx, packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 2 files changed, 83 insertions(+), 1 deletion(-)

### b3b92b6ab25f9814ed566201a1dadcadd7bc0cf0
fix: shadows use post process pipeline + fix sdf bugs
Files: examples/react/lighting/App.tsx, packages/nodes/src/lighting/shadows.test.ts, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/DirectLightEffect.ts, packages/three-flatland/src/debug/bus-pool.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.ts, packages/three-flatland/src/lights/OcclusionPass.test.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 11 files changed, 622 insertions(+), 286 deletions(-)

### bbe5692bd48690d0edcb59ce8515a461e23d3d0f
fix: ambient pipeline
Files: packages/presets/src/lighting/DefaultLightEffect.ts
Stats: 1 file changed, 10 insertions(+), 11 deletions(-)

### ec905ef90f3ef6d27cd8eddbc54a09572d73e63e
feat: enhance lighting and tilemap systems with ambient contributions, shadow handling, and material effects
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, examples/three/lighting/public/maps/dungeon.ldtk, packages/presets/src/lighting/DefaultLightEffect.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/react/attach.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TileLayer.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 11 files changed, 1463 insertions(+), 282 deletions(-)

### 452381341aaa449f1eb72834966677dff8573d8e
feat: rebuild on tweakpane + current API (post-rebase)
Post-rebase rebuild of examples/react/lighting against the
post-restructure codebase. The old demo from PR #17 was dropped
during the rebase because its paths (examples/vanilla/lighting,
microfrontends.json) conflicted with the main-side restructure.

What the new example does:
- Dungeon floor via TileMap2D
- Room perimeter + interior walls as castsShadow Sprite2Ds
- 4 wandering knights + 10 green slimes (each a point light)
- 2 fixed flickering torches at sconce positions
- Keyboard-controlled hero knight (WASD / arrows)
- Ambient, DefaultLightEffect
- Tweakpane panel via @three-flatland/tweakpane/react hooks

Every caster correctly uses `castsShadow` (our per-sprite bit) not
`castShadow` (Object3D's unused-by-us built-in three shadow-map flag).

Rebase fix-ups bundled:
- Flatland._validateLightingChannels uses globalThis.process so
  packages without @types/node (mini-breakout) typecheck clean.
- @three-flatland/presets declares @react-three/fiber as optional peer
  dep so the ThreeElements module augmentation resolves.
- @three-flatland/presets package.json gains ./react subpath export.
- Lint cleanup on unused imports in SpriteGroup, systems, traits.
- Hoisted inline import() type annotations to named import type in
  Flatland.ts + LightEffect.ts.

Refs #11 #14 #16.
Files: examples/react/lighting/App.tsx, examples/react/lighting/index.html, examples/react/lighting/main.tsx, examples/react/lighting/package.json, examples/react/lighting/public/sprites/Dungeon_Tileset.png, examples/react/lighting/public/sprites/knight.json, examples/react/lighting/public/sprites/knight.png, examples/react/lighting/tsconfig.json, examples/react/lighting/vite.config.ts, examples/react/pass-effects/App.tsx, packages/nodes/src/lighting/shadows.ts, packages/normals/src/NormalMapLoader.ts, packages/normals/src/baker.ts, packages/presets/package.json, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/systems/effectTraitsSystem.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/materials/MaterialEffect.type-test.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, pnpm-lock.yaml
Stats: 23 files changed, 2554 insertions(+), 674 deletions(-)

### 9c3ef772b99614e6675269bf783841a0c41fb0f4
feat: thread sdfTexture + world bounds through build context (T5) + consume shadowSDF2D (T7)
T5 extends LightEffectBuildContext with sdfTexture, worldSizeNode, and
worldOffsetNode so effect shaders can bind them via TSL texture() /
uniform reads captured at build time. T7 wires the shadowSDF2D helper
(shipped in T6) into DefaultLightEffect and DirectLightEffect — the
shadow = float(1.0) stub is gone.

Build-time texture capture:
- SDFGenerator constructor now eagerly allocates 1×1 placeholder RTs
  + JFA/final materials. Mirrors the trick in ForwardPlusLighting (see
  its constructor comment) — the sdfTexture reference is stable from
  construction, so TSL texture() bound at shader-build time remains
  valid across resize. init(w, h) collapses to resize(w, h).
- Flatland.setLighting, when the effect declares needsShadows, eagerly
  mints the SDFGenerator + OcclusionPass into the ShadowPipeline trait
  BEFORE calling buildLightFn. shadowPipelineSystem picks up the
  existing instances on first tick and runs init()/resize() against
  them (idempotent — no re-allocation).
- sdfTexture is null for non-shadow effects; shader-side consumers
  compile out the shadow path via a JS-level `if (sdfTexture)` check,
  so no GPU branch or wasted uniform slot.

World-bound uniforms:
- Flatland owns a pair of `uniform(Vector2)` nodes, created once per
  instance and re-used across effects. render() updates `.value` from
  camera bounds each frame — zero-cost mutation, no shader rebuild.
- LightEffectBuildContext carries `worldSizeNode` / `worldOffsetNode`
  alongside lightStore + sdfTexture. Effects that need world↔UV math
  (shadow sampling, future radiance cascades) read from these instead
  of rolling their own.
- DefaultLightEffect previously pulled world uniforms from its
  ForwardPlusLighting constant; now sources them from the build
  context for consistency with DirectLightEffect (which doesn't own a
  ForwardPlusLighting).

Shadow shader consumption (T7):
- DefaultLightEffect.ts:155 and DirectLightEffect.ts:141 — the
  `const shadow = float(1.0)` stub is replaced with a real
  shadowSDF2D call inside `if (sdfTexture)`. Output is scaled by
  shadowStrength (0 disabled → 1 full darkness). shadowSoftness
  controls penumbra width. shadowBias is the self-shadow start
  offset. Ambient lights ignore shadows (preserved from stub
  semantics).

Tests updated: the shadow-pipeline test's "system allocates
generators" assertion flipped to "setLighting eagerly allocates;
system is idempotent" — matches the new contract. 450 tests pass,
typecheck clean.

Phase 1 of the SDF shadow rollout is now complete end-to-end on the
code side. Visual validation (T8) is next: wire a shadow caster into
examples/react/lighting and compare against the baseline.

Refs #11 #14 #16.
Files: packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/DirectLightEffect.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/shadow-pipeline.test.ts
Stats: 6 files changed, 182 insertions(+), 64 deletions(-)

### e62207ad692bd8b26142c2c4d067b1ab468affd3
feat: lighting and lighting effects work
Files: docs/astro.config.mjs, docs/src/content/docs/examples/lighting.mdx, docs/src/content/docs/guides/flatland.mdx, docs/src/content/docs/guides/lighting.mdx, examples/react/pass-effects/App.tsx, examples/three/tilemap/index.html, packages/presets/src/index.ts, packages/presets/src/lighting/AutoNormalProvider.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/DirectLightEffect.ts, packages/presets/src/lighting/NormalMapProvider.ts, packages/presets/src/lighting/RadianceLightEffect.ts, packages/presets/src/lighting/SimpleLightEffect.ts, packages/presets/src/lighting/index.ts, packages/presets/src/react.ts, packages/presets/src/react/index.ts, packages/presets/src/react/lighting/index.ts, packages/presets/src/react/types.ts, packages/presets/tsup.config.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/SystemSchedule.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/index.ts, packages/three-flatland/src/ecs/systems/batchAssignSystem.ts, packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/ecs/systems/batchRemoveSystem.ts, packages/three-flatland/src/ecs/systems/bufferSyncSystem.ts, packages/three-flatland/src/ecs/systems/conditionalTransformSyncSystem.ts, packages/three-flatland/src/ecs/systems/effectTraitsSystem.ts, packages/three-flatland/src/ecs/systems/flushDirtyRangesSystem.ts, packages/three-flatland/src/ecs/systems/index.ts, packages/three-flatland/src/ecs/systems/lateAssignSystem.ts, packages/three-flatland/src/ecs/systems/lightEffectSystem.ts, packages/three-flatland/src/ecs/systems/lightMaterialAssignSystem.ts, packages/three-flatland/src/ecs/systems/lightSyncSystem.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.ts, packages/three-flatland/src/ecs/systems/sceneGraphSyncSystem.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/Light2D.test.ts, packages/three-flatland/src/lights/LightEffect.test.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/lights/LightStore.test.ts, packages/three-flatland/src/lights/LightStore.ts, packages/three-flatland/src/lights/LightingStrategy.ts, packages/three-flatland/src/lights/LightingSystem.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/lights/wrapWithLightFlags.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/MaterialEffect.test.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts, packages/three-flatland/src/materials/channels.test.ts, packages/three-flatland/src/materials/channels.ts, packages/three-flatland/src/materials/index.ts, packages/three-flatland/src/pipeline/PassEffect.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/react/attach.test.ts, packages/three-flatland/src/react/attach.ts, packages/three-flatland/src/react/types.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/sprites/index.ts, packages/three-flatland/src/sprites/types.ts, planning/effect-channels/rfc-effect-channel-dependencies.md, pnpm-lock.yaml, scripts/sync-react-subpaths.ts
Stats: 69 files changed, 5669 insertions(+), 3813 deletions(-)
