---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## Lighting

- Forward+ tiled light culling: TILE_SIZE bumped 16→32 for ~4× CPU cull speedup at high light counts
- Fixed CPU tile-to-shader boundary alignment — eliminates checkerboard gaps in fill-light coverage
- Per-light `castsShadow` flag on `Light2D` (default `true`); shadow trace skipped for lights where `castsShadow: false`
- `Light2D.category` — string tag hashed to a 2-bit bucket (djb2, cached per unique string); each category gets an independent fill-light quota and compensation scale per tile
- `Light2D.importance` — multiplicative bias on tile-ranking score; hero lights set high importance to resist eviction by dense fill clusters
- Fill lights (castsShadow=false) capped at 2 per tile per category; hero lights (castsShadow=true) compete in the global pool and are never evicted by fills
- Per-tile per-category fill compensation: `fillScale = inRange / kept` written to tile meta texel; applied in shaders to preserve total luminance for culled siblings
- Per-sprite `Sprite2D.shadowRadius` (`undefined` = auto-derive from scale); replaces the scene-wide shadowStartOffset uniform for self-shadow escape distance
- `readShadowRadius()` TSL helper for shader consumption of per-instance shadow radius

## SDF Shadow Pipeline

- SDFGenerator produces a signed SDF (packed dual JFA chain in a single ping/pong RT at unsigned cost): outside distance in RG channels, inside distance in BA; signed value available to `shadowSDF2D` for clean `sdf < 0` self-shadow detection

## Instance Buffer

- Core per-instance data moved into a single interleaved buffer (`instanceUV`, `instanceColor`, `instanceSystem`, `instanceExtras`) — frees 3 of the 8 WebGPU vertex buffer slots for effect data growth
- `EffectMaterial.MAX_EFFECT_FLOATS = 12`; clear error thrown at `registerEffect` when the cap would be exceeded
- Per-instance TSL accessor helpers: `readFlip()`, `readSystemFlags()`, `readEnableBits()`, `readLitFlag()`, `readShadowRadius()`, `readCastShadowFlag()`

## Loaders

- `normalDescriptor` loader: reads `.normal.json` sidecar files describing baked normal-map regions
- `LDtkLoader`, `SpriteSheetLoader`, `TiledLoader` updated for normal descriptor integration
- `MaterialEffect` gains elevation channel support

## Debug

- GPU timestamp query detection; stats panel shows/hides GPU timing rows based on capability
- `BatchCollector` for ECS batch inspection; `DevtoolsProvider` protocol extended
- Bucketed sparkline axis range for stable stats graph display

Public API is backwards-compatible. Internal instance buffer attribute names and offsets changed — custom shaders reading `effectBuf0.x/y/z` for system data must migrate to the new `instanceSystem` / `instanceExtras` TSL helpers.

### f6dee7bcd3614859b62a5253ed17d2534e777af5
feat: implement GPU timing detection and enhance stats visibility based on capabilities
Files: packages/devtools/src/dashboard/panels/stats.tsx, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/EnvCollector.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/debug/detectGpuTiming.ts
Stats: 5 files changed, 112 insertions(+), 32 deletions(-)

### 7eb987c66761db7e63cfce2d19ab5453fd93789e
feat: enhance Forward+ lighting with per-category fill quotas and shader rebuild optimizations
Files: examples/react/lighting/App.tsx, examples/three/lighting/main.ts, examples/three/lighting/public/maps/dungeon.ldtk, examples/three/lighting/public/sprites/Dungeon_Tileset.normal.json, examples/three/lighting/public/sprites/Dungeon_Tileset.normal.png, examples/three/lighting/public/sprites/slime.json, examples/three/lighting/public/sprites/slime.png, examples/three/pass-effects/main.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/SimpleLightEffect.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/lights/LightStore.test.ts, packages/three-flatland/src/lights/LightStore.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/effectFlagBits.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 21 files changed, 3761 insertions(+), 975 deletions(-)

### 4d847fa68bce63f9888742ae976a5204f9bc214b
fix: align CPU tile bounds with shader's screen-pixel tile math
ForwardPlusLighting.update computed tile world-space AABBs via
`worldSize / tileCount`, which spreads world evenly across tiles.
The DefaultLightEffect shader computes tile index via
`floor(screenPos / TILE_SIZE)`, which strides by a fixed 32-pixel
step. When the viewport isn't a multiple of TILE_SIZE (almost always
true for the Y axis — 1080 / 32 = 33.75), these produce different
tile boundaries in world space. By the last row, the drift
accumulates to several world units and fragments read a shader tile
the CPU never populated.

Symptom: tile-wide checkerboard gaps in fill-light coverage — a
scene with 1000 slime glows shows tiles that should have glow
contribution rendering dim / green-absent. Worse at TILE_SIZE=32
than 16 (doubled per-tile drift → larger visible gaps).

Fix: CPU uses the same stride the shader implicitly uses:

    tileWorldStride = TILE_SIZE / screenSize * worldSize

The last tile may extend slightly past `worldSize` because
`ceil(screenSize / TILE_SIZE) * TILE_SIZE > screenSize` for non-
multiples, but that overhang is off-screen so no fragments reference
it. With this math CPU and shader agree on which world-space range
each tile owns, and lights land in the same tiles the shader
samples.
Files: packages/three-flatland/src/lights/ForwardPlusLighting.ts
Stats: 1 file changed, 22 insertions(+), 2 deletions(-)

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

### 1b8b18b2dccea6123071fc6b8052f73c43f7365e
perf: bump TILE_SIZE 16 → 32 for 4× CPU-cull speedup
Screen-space tile edge was 16px by default, which produces ~8,160
tiles at 1920×1080 and drives the CPU tile-assignment loop (O(lights
× tiles_per_light)) as the dominant cost at high light counts.

32px quarters the tile count (to ~2,040 at 1920×1080) and the CPU
cost with it — ForwardPlusLighting.update at 1000 slime lights is
noticeably cheaper. Per-fragment shader cost is unchanged
(MAX_LIGHTS_PER_TILE=16 still caps the loop); per-tile light density
rises 4× but shader iterations break on sentinel so only saturated
tiles pay the full cost.

No new config knobs — keeping a single quality floor across desktop
and mobile. A future PR can surface TILE_SIZE / MAX_LIGHTS_PER_TILE
as constructor options on ForwardPlusLighting if project-specific
tuning becomes necessary.
Files: packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts
Stats: 2 files changed, 18 insertions(+), 2 deletions(-)

### e7309ca6ef87d0371d7cceaebb967242ab2111ce
refactor: move per-instance TSL accessors to materials/instanceAttributes
The accessors (readFlip, readSystemFlags, readEnableBits,
readShadowRadius, readLitFlag, readReceiveShadowsFlag,
readCastShadowFlag) were in lights/wrapWithLightFlags.ts — left over
from when wrapWithLightFlags was the only helper in the file. Now
that the file has grown to cover every named field in the interleaved
core buffer, `lights/` is the wrong neighborhood.

Moved to `materials/instanceAttributes.ts` next to `effectFlagBits.ts`
(which defines the LIT_FLAG_MASK / RECEIVE_SHADOWS_MASK / etc.
constants these helpers consume). wrapWithLightFlags stays in
lights/ as a thin lit-gate wrapper — it's the only light-specific
helper in this family.

Internal imports updated:
- Sprite2DMaterial: '../lights/wrapWithLightFlags' → './instanceAttributes'
- OcclusionPass: './wrapWithLightFlags' → '../materials/instanceAttributes'

Public API unchanged — the helpers were already re-exported from
the main `three-flatland` entry, so external imports keep working.
The `lights/` barrel now exports only wrapWithLightFlags.
Files: packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/lights/wrapWithLightFlags.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts, packages/three-flatland/src/materials/index.ts, packages/three-flatland/src/materials/instanceAttributes.ts
Stats: 6 files changed, 140 insertions(+), 127 deletions(-)

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

### 5d651945a79b95f3c43b599ec0baad41cc727819
fix: move shadowRadius to effectBuf0.z to stay under 8-buffer cap
Dropping the new `instanceShadowRadius` vertex attribute that
pushed SpriteBatch from 8 to 9 vertex buffers — WebGPU's hard
maxVertexBuffers cap. Repacks into the existing `effectBuf0.z`
slot, which was reserved per commit f0d2ba1 for a future per-sprite
layer bitmask (speculative, never implemented). That reservation
can move elsewhere if layer bitmasks ever land — the docs already
suggest bit-packing into `.w` alongside picking ID.

Changes:
- SpriteBatch: revert the new attribute + buffer + dirty tracking.
- TileLayer: write tile radius directly into effectBuf0.z alongside
  the existing system-flags write at .x.
- Sprite2D: standalone path writes to the `effectBuf0` custom
  buffer at component 2; batch path writes via `writeEffectSlot`.
- transformSyncSystem: uses `mesh.writeEffectSlot(slot, 0, 2, r)`.
- wrapWithLightFlags.readShadowRadius: reads
  `attribute('effectBuf0').z`.

API surface unchanged — `Sprite2D.shadowRadius` field, auto-
resolve from scale, effect-level `shadowStartOffsetScale`
multiplier all work the same.
Files: packages/three-flatland/src/ecs/systems/transformSyncSystem.ts, packages/three-flatland/src/lights/wrapWithLightFlags.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 5 files changed, 35 insertions(+), 91 deletions(-)

### a3f068706bb0606183a8db10c0f7e8ca072bf66d
fix: instanceShadowRadius as vec2 (only .x used) for TSL binding
Single-component (`itemSize=1`) vertex attributes don't bind
reliably through TSL/WebGPU — all other attributes in the codebase
are vec2/vec4. The size-1 `instanceShadowRadius` attribute
introduced in the previous commit caused sprites to render invisible
because the shader failed to resolve the attribute binding.

Packing the radius into a vec2 (only `.x` populated; `.y` reserved
for a future per-sprite shadow datum like softness or penumbra
width) matches the established pattern and restores rendering. No
API change — `readShadowRadius()` still returns a float node, it
just unpacks `.x` from the underlying vec2 attribute internally.
Files: packages/three-flatland/src/lights/wrapWithLightFlags.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 4 files changed, 44 insertions(+), 29 deletions(-)

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

### 67722352d5fc1bc2b445efd305bb9a15842f4825
refactor: pack signed-SDF JFA into a single ping-pong chain
Replaces the dual-chain approach (commit 79e9e1f) with a packed
RGBA layout where each ping/pong texel carries BOTH seed UVs:

  R, G = nearest-occluder seed UV        (→ distOutside)
  B, A = nearest-empty-space seed UV     (→ distInside)

One seed pass, one JFA chain, one final pass — same structure as
the pre-signed single-chain design. The JFA propagation shader does
two distance comparisons per neighbor instead of one (cheap ALU),
but the expensive texture-sample count per neighbor is unchanged
at one.

Resource comparison at 960×540 (half-res, typical):

                     RTs  Seed  JFA pass  VRAM
  Unsigned (pre)       2    1      11     ~8 MB
  Dual chain (prev)    4    2      22     ~17 MB
  Packed (this)        2    1      11     ~8 MB

Net: signed SDF at the same cost as the old unsigned generator.
Debug buffer names collapse back to `sdf.jfaPing` / `sdf.jfaPong`.
Files: packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 1 file changed, 143 insertions(+), 204 deletions(-)

### a5c7e60e27abcf2120a9ca8a13cca29bd2c978f8
feat: signed SDF via dual JFA chains
SDFGenerator now runs JFA twice — once seeded on occluder texels
(outside distance) and once on empty texels (inside distance) — and
combines them in the final pass as signedDist = distOutside -
distInside. Fragments outside occluders see positive distance;
fragments inside a caster see negative distance.

shadowSDF2D consumes the signed field:
- The at-surface self-shadow detection switches from `sdf < eps` to
  the cleaner `sdf < 0` (strictly inside), eliminating the eps
  approximation for the unsigned case.
- The existing in-loop `sdf < eps` hit check naturally catches
  both grazing hits and rays that stepped into an occluder (since
  negative signed values compare less than positive eps). No
  dedicated negative-distance terminator is needed.

Cost: SDF generation roughly doubles (two JFA chains + two seed
passes). Per-fragment shadow-trace cost is unchanged. SDF
generation is a small fraction of frame time; the correctness win
(no more `escapeOffset = 40` magic calibrated to sprite size)
lands the core fix this spec called out.

Debug buffer names changed — `sdf.jfaPing/Pong` split into
`sdf.jfaPing/PongOutside` and `sdf.jfaPing/PongInside`.
Files: packages/nodes/src/lighting/shadows.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 2 files changed, 229 insertions(+), 102 deletions(-)

### 73efb7e4fa895d236a6acbb37a203283200a9f43
fix: change default resolution scale to 0.5 for performance, cull lights
Files: packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/OcclusionPass.test.ts, packages/three-flatland/src/lights/OcclusionPass.ts
Stats: 3 files changed, 92 insertions(+), 17 deletions(-)

### c69961f4211ccb9ae4ba6e43dee670a3b6a51041
feat: implement bucketed axis range for sparkline stability
Files: packages/devtools/src/dashboard/panels/stats.tsx, packages/three-flatland/src/debug/StatsCollector.ts
Stats: 2 files changed, 185 insertions(+), 26 deletions(-)

### 261d6eec2ff54752239abfef7b227a067c79fca0
refactor: pass castsShadow through Light2D.clone options
Addresses final code review feedback:

1. Light2D.clone() now forwards castsShadow via the constructor
   options like every other field expressible in Light2DOptions,
   instead of the post-construction assignment pattern reserved
   for enabled (which is not in Light2DOptions). No behavior
   change — eliminates a redundant write and makes clone()
   symmetric with construction.

2. Light2D.castsShadow JSDoc now notes that only DefaultLightEffect
   currently respects the flag; DirectLightEffect still traces
   shadows for every non-ambient light.

3. Spec corrected: DirectLightEffect does run shadowSDF2D (the
   earlier wording was factually wrong). Extending the gate to
   DirectLightEffect is called out as a deliberate follow-up.
Files: packages/three-flatland/src/lights/Light2D.ts, planning/superpowers/specs/2026-04-23-per-light-casts-shadow-design.md
Stats: 2 files changed, 7 insertions(+), 3 deletions(-)

### 13eb9d84b9f1a16d5fc8a076bf9b497d6f5149fd
feat: pack castsShadow into LightStore row3.b
Writes the Light2D.castsShadow flag into the previously-unused column
B of row 3 in the lights DataTexture. DefaultLightEffect will read
row3.b in the next commit to gate the SDF shadow trace.

Layout unchanged (free column, no bit packing). enabled semantics
preserved — castsShadow is an independent gate that only affects
shadow tracing, not light contribution.
Files: packages/three-flatland/src/lights/LightStore.test.ts, packages/three-flatland/src/lights/LightStore.ts
Stats: 2 files changed, 59 insertions(+), 8 deletions(-)

### 7fff06603f503508da71a25feac2ca8e69ca60ca
feat: add castsShadow field to Light2D
Adds a per-light opt-out for shadow-casting. Defaults to true for
back-compat. Preserved across clone(). Used by LightStore to pack
the flag into the lights DataTexture for shader consumption.

Part of per-light castsShadow optimization — see
planning/superpowers/specs/2026-04-23-per-light-casts-shadow-design.md
Files: packages/three-flatland/src/lights/Light2D.test.ts, packages/three-flatland/src/lights/Light2D.ts
Stats: 2 files changed, 28 insertions(+)

### 7bd24cb67f3f614627accd34c3547b0e7e54e419
feat: enhance shadow tracing with elevation-aware occlusion and signed SDF; improve material and sprite handling for debug tools
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, examples/react/lighting/public/sprites/slime.json, packages/devtools/src/dashboard/app.tsx, packages/devtools/src/dashboard/client.ts, packages/devtools/src/dashboard/index.html, packages/devtools/src/dashboard/panels/batches.tsx, packages/devtools/src/devtools-client.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/BatchCollector.test.ts, packages/three-flatland/src/debug/BatchCollector.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/loaders/normalDescriptor.test.ts, packages/three-flatland/src/loaders/normalDescriptor.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 23 files changed, 3017 insertions(+), 157 deletions(-)

### e3238bca08b2e6b90c267a5b9e831d68d4e675dc
refactor: remove unused lighting providers and loaders; update lighting tests and tilemap types
Files: packages/nodes/src/lighting/index.ts, packages/presets/src/lighting/AutoNormalProvider.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/DirectLightEffect.ts, packages/presets/src/lighting/NormalMapProvider.ts, packages/presets/src/lighting/TileNormalProvider.ts, packages/presets/src/lighting/index.ts, packages/presets/src/react/types.ts, packages/three-flatland/package.json, packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TiledLoader.ts, packages/three-flatland/src/tilemap/index.ts, packages/three-flatland/src/tilemap/types.ts
Stats: 14 files changed, 192 insertions(+), 1557 deletions(-)

### 5f850bdd862f6e277b8e830b992e1f4e16651747
feat: add normal descriptor loader and baking script; enhance material effects with elevation support
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json, examples/react/lighting/public/sprites/Dungeon_Tileset.normal.png, examples/react/lighting/public/sprites/slime.png, examples/three/lighting/main.ts, package.json, packages/bake/README.md, packages/bake/package.json, packages/bake/src/devtimeWarn.test.ts, packages/bake/src/devtimeWarn.ts, packages/bake/src/discovery.test.ts, packages/bake/src/discovery.ts, packages/bake/src/index.ts, packages/bake/src/node.ts, packages/bake/src/sidecar.test.ts, packages/bake/src/sidecar.ts, packages/bake/src/types.ts, packages/bake/src/writeSidecar.test.ts, packages/bake/src/writeSidecar.ts, packages/bake/tsup.config.ts, packages/nodes/src/lighting/normalFromSprite.ts, packages/normals/README.md, packages/normals/package.json, packages/normals/src/NormalMapLoader.test.ts, packages/normals/src/NormalMapLoader.ts, packages/normals/src/bake.node.ts, packages/normals/src/bake.test.ts, packages/normals/src/bake.ts, packages/normals/src/bakeRegions.test.ts, packages/normals/src/baker.ts, packages/normals/src/cli.test.ts, packages/normals/src/cli.ts, packages/normals/src/descriptor.test.ts, packages/normals/src/descriptor.ts, packages/normals/src/index.ts, packages/normals/src/node.ts, packages/normals/src/resolveNormalMap.ts, packages/normals/tsup.config.ts, packages/three-flatland/src/debug/bus-pool.test.ts, packages/three-flatland/src/loaders/LDtkLoader.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/loaders/TiledLoader.ts, packages/three-flatland/src/loaders/index.ts, packages/three-flatland/src/loaders/normalDescriptor.test.ts, packages/three-flatland/src/loaders/normalDescriptor.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/materials/channels.ts, packages/three-flatland/src/sprites/types.ts, pnpm-lock.yaml, scripts/bake-dungeon-normals.ts, turbo.json
Stats: 52 files changed, 5924 insertions(+), 404 deletions(-)

### c227ab4942cee2a203e734be02c14b5119bdef85
feat: enhance debug protocol with buffer subscription and effect field location
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, packages/devtools/src/buffers-modal.ts, packages/devtools/src/buffers-view.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/devtools-client.ts, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/TileNormalProvider.ts, packages/presets/src/lighting/index.ts, packages/presets/src/react/types.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/bus-pool.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TileLayer.ts
Stats: 22 files changed, 673 insertions(+), 221 deletions(-)

### 2340e1cbbf0aaaf01a7bd77e366cd347d4c83d32
fix: enable separable 5-tap binomial blur for smoother SDF transitions
Files: packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 1 file changed, 15 insertions(+), 9 deletions(-)

### b3b92b6ab25f9814ed566201a1dadcadd7bc0cf0
fix: shadows use post process pipeline + fix sdf bugs
Files: examples/react/lighting/App.tsx, packages/nodes/src/lighting/shadows.test.ts, packages/nodes/src/lighting/shadows.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/DirectLightEffect.ts, packages/three-flatland/src/debug/bus-pool.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.ts, packages/three-flatland/src/lights/OcclusionPass.test.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 11 files changed, 622 insertions(+), 286 deletions(-)

### d71a05dc95cb36df29cb007503ed752ab2ffea89
fix: tiles lighting lookup texture (2d)
Files: packages/three-flatland/src/lights/ForwardPlusLighting.ts
Stats: 1 file changed, 60 insertions(+), 21 deletions(-)

### ec905ef90f3ef6d27cd8eddbc54a09572d73e63e
feat: enhance lighting and tilemap systems with ambient contributions, shadow handling, and material effects
Files: examples/react/lighting/App.tsx, examples/react/lighting/public/maps/dungeon.ldtk, examples/three/lighting/public/maps/dungeon.ldtk, packages/presets/src/lighting/DefaultLightEffect.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/react/attach.ts, packages/three-flatland/src/tilemap/LDtkLoader.ts, packages/three-flatland/src/tilemap/TileLayer.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 11 files changed, 1463 insertions(+), 282 deletions(-)

### 787eee29d962af49056d207f679a0ef11a9720d8
fix: force keyframe on buffer switch in stream mode
The forceKeyFrame field was dropped during the __encode__ → __convert__
refactor. Without it, switching buffers in the modal produced only
delta frames for the new buffer — the decoder waited for a keyframe
that never came.

Now: provider passes _forceNextKeyFrame through ConvertRequest →
worker → StreamEncoder. Set on every subscribe with streamBuffers
(including buffer switches). First chunk after switch is a keyframe
→ decoder starts immediately.
Files: packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/bus-transport.ts, packages/three-flatland/src/debug/bus-worker.ts
Stats: 3 files changed, 8 insertions(+), 2 deletions(-)

### e48037476c311a341266a6feea19417ff48040fa
feat: register all lighting pipeline debug textures
New registrations:
- radiance.sceneRadiance — GI scene radiance (lights as soft circles)
- radiance.finalIrradiance — final averaged GI irradiance map
- radiance.cascade0..N — each cascade level of the radiance pyramid
- sdf.jfaPing / sdf.jfaPong — JFA intermediate seed buffers

All rgba16f RenderTargets, maxDim:0 (native resolution readback).
Cascade RTs unregister/re-register on rebuild (config change).

Total registered: 7 existing + 6 new (+ N cascade levels) = 13+
Files: packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 2 files changed, 38 insertions(+), 5 deletions(-)

### 6fd83fcb4d8770325a6f60d047b7b9e033860abb
fix: move texture readback to end-of-frame
Readbacks now fire from endFrame() when all render passes are complete,
not from the 250ms flush timer at arbitrary points in the frame. The
flush timer just ships whatever cached samples exist.

Before: readback GPU copy enqueued mid-frame → captured partially
rendered content → blocky strips in SDF visualization.

After: readback enqueued after Flatland.render() completes all passes
(occlusion → SDF → main → post) → captures consistent frame content.
Files: packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts
Stats: 2 files changed, 23 insertions(+), 5 deletions(-)

### 11440df5e3318221e120973adc73488d7fec86b2
refactor: unified worker conversion + GPU row padding + alpha display
All pixel format conversion now happens on the worker thread. Provider
ships raw bytes in native format, worker converts to display-ready
RGBA8, then broadcasts as buffer:raw (or VP9-encodes for stream mode).
Consumer receives RGBA8 only — no decoder math on main thread or
consumer side.

Pipeline:
  Provider → __convert__(raw bytes, pixelType, display, pixelsByteLength)
  Worker: convertToRGBA8() → RGBA8
    ├─ stream: VP9 encode → buffer:chunk
    └─ raw:    buffer:raw  → putImageData directly

Key fixes:
- Pass actual pixel byte length separately from pool buffer size.
  Pool buffers are 2MB; pixel data is ~900KB. Without this, padding
  detection computed wildly wrong row strides (~7KB instead of 3KB).
- GPU row padding: WebGPU aligns bytesPerRow to 256. three.js r183
  does NOT strip this padding. Converter detects it from data byte
  length and reads with correct row stride.
- Worker bounces pool buffer AFTER conversion (was bouncing before,
  detaching the ArrayBuffer mid-read).
- New 'alpha' display mode reads the A channel as greyscale. Used
  by occlusion mask where RGB=(0,0,0) and data is in alpha only.
- Removed all consumer-side decoder functions from buffers-view.ts
  and buffers-modal.ts.
- Square corners on modal canvas (removed border-radius).

pixel-convert.ts handles: rgba8, r8, rgba16f (f16→f32 via manual
half-float decode), rgba32f. Each with display modes: colors,
normalize, mono, signed, alpha. 11 unit tests including GPU row
padding scenarios.
Files: packages/devtools/src/buffers-modal.ts, packages/devtools/src/buffers-view.ts, packages/devtools/src/devtools-client.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/bus-transport.ts, packages/three-flatland/src/debug/bus-worker.ts, packages/three-flatland/src/debug/pixel-convert.test.ts, packages/three-flatland/src/debug/pixel-convert.ts, packages/three-flatland/src/lights/OcclusionPass.ts
Stats: 10 files changed, 561 insertions(+), 416 deletions(-)

### e38ce8d782350892db2885a44111a9e3eeb17cec
feat: worker-side pixel format conversion for all texture types
All registered textures are now VP9-encoded regardless of pixel format.
The bus worker converts raw pixels to RGBA8 before creating the
VideoFrame, using the registered display mode (signed, normalize, mono,
colors) to produce the correct visual representation.

New pixel-convert.ts module handles:
- rgba8: direct copy or mono greyscale
- r8: expand single channel to RGB
- rgba16f: f16→f32 conversion via manual half-float decode, then
  display-mode-specific mapping (signed: diverging red/green,
  normalize: auto min/max per channel, mono: greyscale)
- rgba32f: same display-mode mappings on native float data

Fixes SDF distance field rendering — readback returns Uint16Array
(raw half-float bytes) which was being wrapped as Uint8Array and
passed directly to the encoder, producing garbage. Now properly
decoded and visualized as a signed distance gradient.

Provider no longer skips float textures — all formats route through
the worker encode path when stream mode is active.
Files: packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/bus-worker.ts, packages/three-flatland/src/debug/pixel-convert.ts
Stats: 4 files changed, 152 insertions(+), 20 deletions(-)

### 069b9afe89e90ca78f35e8a60b15bb4f055a2461
fix: revert to pool-buffer copy for encode (40B view at 4Hz is negligible)
Files: packages/three-flatland/src/debug/DevtoolsProvider.ts
Stats: 1 file changed, 2 insertions(+), 3 deletions(-)

### 2760e2e5fa0c4470c208aadc966b1ef10bf3e4eb
fix: prevent paint() from wiping decoder output + skip float encoding
Two fixes for the fullscreen modal:

1. When VideoDecoder is active, skip the raw-pixel paint() path in
   refresh(). In stream mode the provider strips pixels from the data
   batch, so snap.pixels is null — paint() was resetting the canvas
   to 1×1, overwriting the decoder's output every state change.

2. Only VP9-encode rgba8/r8 textures. Float textures (rgba16f/rgba32f)
   fall through with raw pixels intact — the VideoEncoder expects 8-bit
   RGBA input, and feeding it float bytes produces garbage. The
   consumer's CPU decoder handles float data correctly.

Also preserve Float32Array from readback (don't wrap as Uint8Array)
so the consumer's decoders see the correct typed array.
Files: packages/devtools/src/buffers-modal.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 5 files changed, 17 insertions(+), 10 deletions(-)

### d4f8ea3e9ec3a444de92aeeb172b3dfdf70d43fc
fix: match three.js readRenderTargetPixelsAsync signature
three.js r183 signature is (rt, x, y, w, h) → Promise<TypedArray>.
No buffer param — the method allocates and returns its own. Our code
was passing a Uint8Array as the 6th arg, which three.js interpreted
as textureIndex, causing renderTarget.textures[uint8Array] → undefined
→ silent readback failure.

Also skip readback for 1×1 render targets (not yet sized).
Files: packages/three-flatland/src/debug/DebugTextureRegistry.ts
Stats: 1 file changed, 8 insertions(+), 11 deletions(-)

### 096a6f82a8d3a67dcf64e94f3461ee7f1747c63e
fix: bump version + invalidate sample on render target resize
When a registered RenderTarget's live dimensions differ from the
cached width/height, bump the entry version (so the drain skip-check
fails) and null out the stale sample + pending readback. This triggers
a fresh readback at the correct size on the next drain cycle.

Fixes: SDF/occlusion RTs start at 1×1, get registered, first readback
captures 1×1, then RT resizes to viewport dims — but no version bump
meant subsequent drains skipped the entry and never re-read.
Files: packages/three-flatland/src/debug/DebugTextureRegistry.ts
Stats: 1 file changed, 15 insertions(+), 5 deletions(-)

### 95442110b93aefe46b6445000e88cdcff1e3a919
fix: read live render target dimensions at drain time
RenderTargets start at 1×1 and resize later. The cached width/height
from registration time was 0 (no prior readback). Now reads the live
width/height from the source object at the start of each drain entry,
so metadata always reflects the current size.
Files: packages/three-flatland/src/debug/DebugTextureRegistry.ts
Stats: 1 file changed, 11 insertions(+)

### 32d8e83b81eedc501434c382c17e627412124968
fix: queue debug registrations that arrive before provider start
registerDebugArray/registerDebugTexture now queue calls that arrive
while the module-level registry is null (before DevtoolsProvider.start
sets it). Queued entries are replayed when the registry becomes
available.

Fixes: SDFGenerator and OcclusionPass register debug textures in
their constructors — which runs during Flatland init, before the
provider lazy-starts on first render(). Without queuing, those
registrations were silently dropped.
Files: packages/three-flatland/src/debug/debug-sink.ts
Stats: 1 file changed, 21 insertions(+), 2 deletions(-)

### 388ed1e7b6019b68dd45240f7d24f4b31a4de11c
feat: modal pan/zoom + register SDF/occlusion debug textures
Modal:
- Mouse wheel zoom centered on cursor, drag to pan
- Reset transform on buffer switch + modal open
- Canvas cursor changes to grab/grabbing during interaction

New debug texture registrations:
- sdf.distanceField (RenderTarget, rgba16f, display: signed) — the
  signed distance field, viewport-sized, shows wall distances as a
  diverging red/green gradient
- occlusion.mask (RenderTarget, rgba8, display: mono) — binary
  occlusion silhouette, viewport-sized, white=solid black=empty
Files: packages/devtools/src/buffers-modal.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/SDFGenerator.ts
Stats: 3 files changed, 82 insertions(+)

### 8b3ae9bfdb04385b87ee8bb9e642d6e2cdce7ba5
feat: WebCodecs VP9 encoding for fullscreen buffer streaming
Adds worker-side VP9 video encoding for the fullscreen buffer modal.
When the modal opens, the provider encodes readback pixels via
VideoEncoder on the bus worker thread and broadcasts EncodedVideoChunks.
The consumer decodes them via VideoDecoder and draws VideoFrames
directly to the modal canvas. Thumbnails stay on the existing raw-pixel
path.

Architecture:
- StreamEncoder class in bus-worker.ts wraps VideoEncoder (VP9,
  quantizer mode, realtime latency, 4fps hint)
- Raw pixel buffer transferred to worker, copied into VideoFrame,
  bounced back to pool immediately (encoder has its own copy)
- Encoded chunks broadcast as 'buffer:chunk' messages on the existing
  BroadcastChannel
- Worker probes codec support on init, reports back to producer

Protocol:
- BufferChunkPayload type (name, frame, capturedAt, dims, codec, data)
- SubscribePayload.streamBuffers flag triggers encode path
- Force keyframe on new subscriber + dimension change + every ~2s

Provider (DevtoolsProvider._flush):
- Stream mode: drain metadata only (no raw pixels in data batch),
  post __encode__ requests to worker with pixel buffers
- Non-stream mode: unchanged raw-pixel path

Consumer (buffers-modal.ts):
- Creates VideoDecoder on first chunk, reconfigures on dimension change
- Waits for keyframe before decoding (handles late join)
- Falls back to raw-pixel paint() when WebCodecs unavailable

Fallback: VideoEncoder.isConfigSupported() probed async on worker init.
When unsupported (Firefox, older Safari), stream flag is silently
ignored and raw pixels flow as before.
Files: packages/devtools/src/buffers-modal.ts, packages/devtools/src/devtools-client.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/bus-transport.ts, packages/three-flatland/src/debug/bus-worker.ts
Stats: 7 files changed, 503 insertions(+), 24 deletions(-)

### 2a8ea7a857a6ae3414c54af22e25e8e963002c5a
fix: React lifecycle overhaul + DevtoolsProvider pure constructor
DevtoolsProvider class:
- Constructor is now side-effect-free (no BroadcastChannel, no Worker,
  no announce, no timer). Safe to construct speculatively from R3F
  reconciler — discarded renders produce inert objects that GC cleanly.
- Explicit start()/dispose() lifecycle. start() opens channels, announces,
  starts flush timer. dispose() tears down and broadcasts provider:gone.
  Both idempotent, multi-cycle (start→dispose→start works).
- Flatland.render() lazy-starts on first call; vanilla and React paths
  both activate only when render() is actually invoked.

React hooks:
- usePane: dropped useFrame dependency entirely. Stats graph now self-ticks
  via driver:'raf' (own requestAnimationFrame). Works whether usePane is
  called inside or outside <Canvas> context.
- usePaneFolder/usePaneInput: switched from deferred-disposal (setTimeout
  hack) to useLayoutEffect with [parent, key] deps. Cleanup disposes
  immediately, re-binds when parent identity changes (StrictMode remount).
- New <DevtoolsProvider /> component: passive sampler using default-phase
  useFrame (endFrame→beginFrame per tick). Does NOT take over R3F's render
  slot. Gated by DEVTOOLS_BUNDLED + isDevtoolsActive() so it's safe in
  production builds.

React examples:
- Added <DevtoolsProvider name="..."/> to all non-Flatland React examples
  (animation, basic-sprite, batch-demo, knightmark, skia, template,
  tilemap, tsl-nodes).
- pass-effects: migrated raw pane.addBinding to usePaneInput.

Renamed Flatland._debug → _devtools throughout.
Files: examples/react/animation/App.tsx, examples/react/basic-sprite/App.tsx, examples/react/batch-demo/src/App.tsx, examples/react/knightmark/App.tsx, examples/react/pass-effects/App.tsx, examples/react/skia/App.tsx, examples/react/template/App.tsx, examples/react/tilemap/App.tsx, examples/react/tsl-nodes/App.tsx, packages/devtools/src/create-pane.ts, packages/devtools/src/react.ts, packages/devtools/src/react/devtools-provider.tsx, packages/devtools/src/react/use-pane-folder.test.tsx, packages/devtools/src/react/use-pane-folder.ts, packages/devtools/src/react/use-pane-input.test.tsx, packages/devtools/src/react/use-pane-input.ts, packages/devtools/src/react/use-pane.test.tsx, packages/devtools/src/react/use-pane.ts, packages/devtools/tsup.config.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/createDevtoolsProvider.ts, packages/three-flatland/src/index.ts
Stats: 23 files changed, 441 insertions(+), 264 deletions(-)

### b2ebc705eeec022c4a13f24da108aea6c62d6a2b
fix: R3F useFrame priority API + createDevtoolsProvider helper for non-Flatland apps
(1) usePane: switch from positional `useFrame(cb, 1000)` to options-
object `useFrame(cb, { priority: 1000 })`. R3F deprecated the positional
form; the warning now goes away in every React example.

(2) New `createDevtoolsProvider(opts?)` helper exported from
`three-flatland`. Returns a real `DevtoolsProvider` when
`DEVTOOLS_BUNDLED && isDevtoolsActive()`, otherwise a no-op stub
(`beginFrame`/`endFrame` do nothing — terser strips the call sites in
prod builds via the build-time const fold).

Use case: vanilla three.js examples that don't construct a `Flatland`.
Flatland constructs its provider internally; non-Flatland apps had no
way to opt in, so their devtools pane stayed blank. `basic-sprite`
(three) updated to demonstrate the pattern — other vanilla examples
follow the same recipe (import + construct + bracket the
`renderer.render(...)` call with `beginFrame` / `endFrame`).
Files: examples/three/basic-sprite/main.ts, packages/devtools/src/react/use-pane.ts, packages/three-flatland/src/debug/createDevtoolsProvider.ts, packages/three-flatland/src/index.ts
Stats: 4 files changed, 79 insertions(+), 2 deletions(-)

### 67058bc58867723997ace81394626703dbdeec32
fix: bump large pool tier to 2 MB, fail-soft on oversized entries
`tileScores` at 1080p is ~510 KB, blowing past the 256 KB large tier and
making `copyTypedTo` throw on every flush — which killed the registry
stream the moment the user cycled to the `forwardPlus` group.

Two changes:

1. `POOL.large.size` → 2 MB (8 MB total pool memory). Sized to fit a
   combined drain of `tileScores` + `lightCounts` + `lightStore.data` +
   stats batch with headroom for 4K and future registrations.
2. `DebugRegistry.drain` and `DebugTextureRegistry.drain` now check
   remaining cursor space before `copyTypedTo`. If a single entry
   wouldn't fit, ship metadata-only and log a one-shot warn —
   per-entry `warnedOversized` flag prevents log spam, and the rest
   of the flush still goes through.
Files: packages/three-flatland/src/debug/DebugRegistry.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/bus-pool.ts
Stats: 3 files changed, 53 insertions(+), 15 deletions(-)

### 0129acb230316b015d35b87e804ffaadd86f29a5
perf: wire DevtoolsProvider over BusTransport, route data through worker pool
End-to-end zero-alloc-on-render-thread for the data-channel hot path:

- Each `_flush` acquires a large pool buffer from `BusTransport`.
- Encoders (`StatsCollector.drainBatch`, `DebugRegistry.drain`,
  `DebugTextureRegistry.drain`) gained an optional `into?: BufferCursor`
  param. When present, they `copyTypedTo(cursor, ring)` — memcpy
  private-ring contents into successive offsets of the supplied pool
  buffer, returning typed-array views over those offsets. When omitted
  (the inline transport path), they keep the legacy "view-over-private
  -ring + BC structuredClone" behaviour.
- `BufferCursor` + `copyTypedTo` helpers added to `bus-pool.ts`.
- Producer's `_dataTransport.post(msg, [poolBuf])` transfers the buffer
  to the worker — zero structuredClone on the producer thread.
- Worker's `bc.postMessage(msg)` runs `structuredSerialize`
  synchronously, copying typed-array bytes into BC delivery queues.
  After it returns the worker bounces the buffer back to the producer's
  pool via transfer.
- `releaseUnused(buf)` lets the producer return a pool buffer when a
  flush turns out to have no encoded features (idle pings, etc.).
- Lifecycle messages (`subscribe:ack`, `ping`) now also go through
  `_dataTransport.post` (no pool buffer — small payloads, structuredClone
  cost trivial). Provider's `_dataBus` BroadcastChannel stays for inbound
  (`subscribe`/`ack`/`unsubscribe`).
- Inline transport (Worker spawn failed / no bundler) keeps current
  behaviour — no perf change there, but the API is unified.

All 514 tests still pass.
Files: packages/three-flatland/src/debug/DebugRegistry.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/debug/bus-pool.ts, packages/three-flatland/src/debug/bus-transport.ts
Stats: 6 files changed, 165 insertions(+), 49 deletions(-)

### 2a022673ac07b65ba71f981fceb27412a355db3e
feat: bus offload-worker scaffolding (frame, pool, transport, worker)
Foundation for moving the producer's BroadcastChannel hot path off the
render thread. No behavioural change yet — DevtoolsProvider still posts
direct to BroadcastChannel. Encoder migration (StatsCollector,
DebugRegistry, DebugTextureRegistry → write into pool buffers,
producer transfers to worker) lands in a follow-up.

Pieces:

- `bus-frame.ts` — fixed 16-byte header + `FrameWriter` / `FrameReader`
  with zero-alloc DataView writes. Type tags + feature ids exported as
  stable constants. Held in reserve for cases where the typed-array-
  view-over-pool-buffer approach isn't viable (e.g. lots of small
  numeric fields whose direct write is cheaper than building
  TypedArray views). 9 unit tests covering header round-trip, scalar
  types, overflow, ts > 2^32, reader bounds.

- `bus-pool.ts` — two hard-coded tiers (small 4 KB × 8, large
  256 KB × 4) with `acquireSmall` / `acquireLarge` / `release`,
  exhaustion counters + warning throttle, orphan path for buffers
  whose size matches neither tier (one-off fallbacks). 11 unit tests.

- `bus-worker.ts` — worker entry. Boots, allocates both tiers,
  transfers the buffers to the producer in two `__pool_init__`
  messages. Forwards subsequent messages to its `BroadcastChannel`,
  bouncing any tagged `__poolBufs` back to the producer's pool via
  transfer.

- `bus-transport.ts` — `BusTransport` interface (acquire small/large,
  post, poolStats, dispose) with two impls. `WorkerBusTransport`
  spawns the worker, holds the pool, posts via the worker. Uses the
  canonical Vite/webpack worker URL pattern
  (`new Worker(new URL('./bus-worker.ts', import.meta.url))`).
  `InlineBusTransport` is the fallback — direct BroadcastChannel,
  pool methods just `new ArrayBuffer(...)` for API consistency.
  `createBusTransport(opts)` picks the worker path when available,
  silently falls back to inline on any spawn failure.
Files: packages/three-flatland/src/debug/bus-frame.test.ts, packages/three-flatland/src/debug/bus-frame.ts, packages/three-flatland/src/debug/bus-pool.test.ts, packages/three-flatland/src/debug/bus-pool.ts, packages/three-flatland/src/debug/bus-transport.ts, packages/three-flatland/src/debug/bus-worker.ts
Stats: 6 files changed, 884 insertions(+)

### 9b6608b4db0cbd89c62f040cf1dab4df83620cdc
perf: dedupe rAF allocs, gate registry/buffer payloads, add timing tracks
Canvas replaces SVG polyline in stats-graph: per-rAF `setAttribute('points', longString)`
was (a) allocating ~5k template-literal fragments per second and (b) invalidating
CSS selectors up the `.tp-cntv` chain, showing up in heap profiles as thousands of
selector-string allocations. `ctx.beginPath` / `lineTo` is pure path state, no DOM
mutation, no strings. Also dedupes `textContent` writes via boxed cache holders —
only re-assigns when the rendered text actually changes.

Throttles `StatsCollector.maybeResolveGpu` from every frame (60 Hz) to every 6
frames (10 Hz). Drops the Promise + `.then`/`.catch` closure churn by 6× while
still keeping three's GPU query pool drained and yielding fresh timings every
batch.

Buffers view: caches the `ImageData` across paints when source dimensions match.
Was allocating a fresh ~100 KB `Uint8ClampedArray` per render (~400 KB/s at 4 Hz
thumb refresh).

`DebugTextureRegistry` gains a `maxDim` cap per entry (default 256 for render
targets, 0 / no-op for DataTextures) and a lazy-allocated GPU `Downsampler`.
Render targets larger than `maxDim` get blitted into an aspect-fit scratch RT
(TSL `NodeMaterial` + fullscreen quad) before readback, so a 1920×1080 SDF
reads back at 256×144 (~150 KB) instead of 8 MB per drain.

Buffer display modes shipped (`colors` / `normalize` / `mono` / `signed`) with
format-driven defaults (byte → colors, float → normalize). Signed uses a
red↔green diverging palette around mid-grey — good fit for SDFs later.

`perf-track.ts` introduces a single-helper API (`perfMeasure` / `perfStart`)
that emits User Timing spans on Chrome's custom-track extension
(`detail.devtools`). Convention: trackGroup `three-flatland`, tracks lowercase
(`devtools`, `lighting`, `sprites`, `sdf`). Provider's per-flush CPU span and
consumer's bus-receive latency spans all land on the `devtools` track.
`tracePerf` attaches per-message byte counts as entry properties (walked on
the receive side, done after the latency `end` timestamp so the walk doesn't
pollute the measurement).
Files: packages/devtools/src/buffers-view.ts, packages/devtools/src/perf-trace.ts, packages/devtools/src/stats-graph.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/debug/perf-track.ts
Stats: 8 files changed, 467 insertions(+), 71 deletions(-)

### 7e4a4326945a4063ab0ad811d9ce60f0a5792172
feat: debug buffers (Phase C MVP) — registry, readback, thumbnail blade
Adds a parallel pipeline to the CPU-array registry for visualising live
GPU buffers in the pane.

Protocol:
- New `buffers` feature (`subscribe.features` + `subscribe.buffers` for
  per-entry selection). Renames `registryFilter`/`atlasFilter` →
  `registry`/`buffers` on the subscribe payload to match `features` shape.
- `BuffersPayload.entries[name]: BufferDelta` with `width`, `height`,
  `pixelType`, `version`, `display`, optional `pixels`. Metadata always
  ships so the UI lists available buffers; pixels are gated by selection.
- `BufferDisplayMode = 'colors' | 'normalize' | 'mono' | 'signed'` with
  format-driven defaults (byte → colors, float → normalize).

Provider:
- `DebugTextureRegistry` mirrors `DebugRegistry`. `DataTexture` paths
  copy the CPU buffer; `RenderTarget` paths use `renderer.readRenderTargetPixelsAsync`,
  one in-flight at a time per entry. Caches latest sample.
- `_setActiveTextureRegistry` + `registerDebugTexture` /
  `touchDebugTexture` / `unregisterDebugTexture` — mirrors the array sink,
  no-op when `DEVTOOLS_BUNDLED` is false.
- `SubscriberRegistry` tracks per-consumer `buffers` selection + caches
  the union; `DevtoolsProvider._flush` drains via `buffersSelection()`.

Engine:
- `LightStore.lightsTexture` published as `lightStore.lights`.
- `ForwardPlusLighting._tileTexture` published as `forwardPlus.tiles`.

Client:
- `state.buffers: Map<name, BufferSnapshot>`. `_applyBuffers` decodes
  metadata-or-full deltas, retains last-seen `pixels` when only metadata
  ships. `setBuffers(names | null)` mirrors `setRegistry`.
- `tracePerf(msg)` (`perf-trace.ts`) emits `bus:<type>` `performance.measure`
  spans on every inbound bus message — visible in Chrome DevTools
  Performance → Timings as bars from sender ts to receive now.

UI:
- `buffers-view.ts` blade: single row, `◀ name ▶` arrows cycle the flat
  list of every registered buffer, 240×120 thumbnail with overlays
  (dimensions/format chip bottom-left, expand `⤢` button bottom-right —
  expand stubs to a console.info, fullscreen modal lands next).
- ResizeObserver keeps the canvas backing locked to the rendered CSS
  size × DPR (the missing piece behind earlier "tiny in upper-left"
  bugs).
- Stretch-to-fill draw: every source pixel maps somewhere in the
  thumbnail (deliberately distorts wide-and-short buffers so all data
  is visible — the fullscreen viewer is for aspect-correct inspection).
- Four decoders selected by `display`: `colors`, `normalize`,
  `signed` (red↔green diverging), `mono`. Normalize forces α=1 so
  unused-but-zero cells render as black instead of vanishing.
- Same dark-overlay treatment + collapse-by-default + visibility-driven
  selection narrowing as `registry-view`.

Renames for clarity: `setRegistryFilter` → `setRegistry`, `atlasFilter` →
`buffers` on the subscribe payload; provider's `atlasFilter()` →
`buffersSelection()`. The selection field on the subscribe is named
after the feature it selects within, matching the existing `features`
top-level array.
Files: packages/devtools/src/buffers-view.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/devtools-client.ts, packages/devtools/src/perf-trace.ts, packages/devtools/src/registry-view.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DebugTextureRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/LightStore.ts
Stats: 13 files changed, 1077 insertions(+), 64 deletions(-)

### f4cfde0af82059d33b1b60f4cbddd872b065531d
feat: batched typed-array stats, DebugRegistry, two-channel bus
Stats pipeline now collects per-frame samples into preallocated typed-array
rings on the provider and flushes in 250ms batches via `subarray` views
(zero data copy). Client decodes on arrival into Float32 series rings +
scalar batch means for the text label. Graph interpolates between batches
for smooth motion from a 4 Hz stream; `driver: 'manual'` lets the host
drive `bundle.update()` from its own frame loop (R3F hook uses
`useFrame(update, 1000)` automatically).

Protocol split into two BroadcastChannels: shared discovery (`flatland-debug`)
for `provider:query` / `announce` / `gone`, and per-provider data channels
(`flatland-debug:<id>`) for subscribe / ack / data / ping. `providerId`
dropped from the hot-path messages since routing is now implicit.

New Phase B DebugRegistry lets engine code publish CPU typed arrays via
the module-level `registerDebugArray` / `touchDebugArray` sink (no-op
when `DEVTOOLS_BUNDLED` is false — zero cost in prod). ForwardPlusLighting
publishes `lightCounts` + `tileScores`; LightStore publishes its DataTexture
backing. Pane renders them in a grouped, collapsible registry blade with
cycle arrows — starts collapsed, reveals itself once entries exist. Per-
entry filter on the subscribe protocol means only the visible group's
typed arrays hit the wire; metadata (name/kind/count) always ships so
group cycling works before any sample is requested.

Visibility-driven bandwidth throttling: collapsing the main pane sets
`features: []`; collapsing the registry sets `registryFilter: []`;
switching groups narrows the filter to the active group's entries.
Idle pings keep liveness alive even when every feature is off.

Other: Phase A stats polish — primitives (lines+points) added as a
stats field, heap sampling moved to producer (removes the consumer's
direct `performance.memory` access), first-class `createPane({ driver })`.
Registry view: grouped by name prefix, ◀ name ▶ header cycles groups,
clicking the header toggles collapse, darker translucent background
sinks the blade visually. All 10 vanilla-three examples migrated to
`driver: 'manual'` + `updateDevtools()`. Docs guide rewritten against
current API.
Files: docs/src/content/docs/guides/debug-controls.mdx, examples/react/CLAUDE.md, examples/react/animation/App.tsx, examples/react/basic-sprite/App.tsx, examples/react/batch-demo/src/App.tsx, examples/react/knightmark/App.tsx, examples/react/lighting/App.tsx, examples/react/pass-effects/App.tsx, examples/react/skia/App.tsx, examples/react/template/App.tsx, examples/react/tilemap/App.tsx, examples/react/tsl-nodes/App.tsx, examples/three/animation/main.ts, examples/three/basic-sprite/main.ts, examples/three/batch-demo/main.ts, examples/three/knightmark/main.ts, examples/three/lighting/main.ts, examples/three/pass-effects/main.ts, examples/three/skia/main.ts, examples/three/template/main.ts, examples/three/tilemap/main.ts, examples/three/tsl-nodes/main.ts, packages/devtools/src/create-pane.test.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/devtools-client.ts, packages/devtools/src/devtools-panel.ts, packages/devtools/src/index.ts, packages/devtools/src/provider-switcher.ts, packages/devtools/src/react.ts, packages/devtools/src/react/use-devtools-panel.ts, packages/devtools/src/react/use-pane-button.test.tsx, packages/devtools/src/react/use-pane-folder.test.tsx, packages/devtools/src/react/use-pane-input.test.tsx, packages/devtools/src/react/use-pane.test.tsx, packages/devtools/src/react/use-pane.ts, packages/devtools/src/react/use-stats-monitor.ts, packages/devtools/src/registry-view.ts, packages/devtools/src/stats-graph.ts, packages/devtools/src/stats-row.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DebugRegistry.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/LightStore.ts
Stats: 49 files changed, 2125 insertions(+), 1875 deletions(-)

### b67afe823042c3fb609a517513bcfb7f3c75cfd6
feat: multi-provider discovery protocol
Rename \`Producer\` → \`Provider\` (we're a broadcaster; "provider"
describes the role). Add a discovery protocol so consumers can find
providers without hardcoded assumptions, pick by preference, and
auto-switch when providers appear/disappear.

## Protocol additions

- \`provider:announce { identity }\` — provider → all, on construct +
  in response to every \`provider:query\`. Identity carries
  \`{ id, name, kind }\`.
- \`provider:query {}\` — consumer → all, on start (discovery).
- \`provider:gone { id }\` — provider → all, on dispose.
- Every server-emitted message (\`data\`, \`ping\`, \`subscribe:ack\`)
  now tags \`providerId\` so consumers filter by selected provider.
- \`subscribe\` / \`unsubscribe\` / \`ack\` carry an optional
  \`providerId\` targeting; providers ignore messages addressed to a
  different id.
- \`DISCOVERY_WINDOW_MS = 150ms\` constant — consumer collects
  announces for this long before picking.

## Provider identity

\`\`\`ts
interface ProviderIdentity {
  id: string          // UUID
  name: string        // 'flatland', 'my-engine', etc.
  kind: 'system' | 'user'
}
\`\`\`

\`kind\` is package-private. External callers of \`new DevtoolsProvider()\`
always get \`user\`; public \`DevtoolsProviderOptions\` has no \`kind\`
field. System providers are constructed via a package-internal
\`DevtoolsProvider._createSystem()\` factory that Flatland uses. Enforced
by the type system — consumers can't synthesize a system provider.

## Selection

Consumer on \`start()\`:
1. Send \`provider:query\`.
2. Collect \`provider:announce\` responses over \`DISCOVERY_WINDOW_MS\`.
   Any providers that existed before the client started are already in
   the known map via their announces, so late start still sees them.
3. \`_pickProviderAndSubscribe\` picks best: \`user\` over \`system\`.
   First-announced as tiebreak.
4. \`subscribe { providerId }\` targets that one.
5. Filters all \`data\` / \`ping\` / \`subscribe:ack\` by matching
   \`providerId === selected\`.

Auto-switch: on \`provider:gone\` matching the current selection,
clears accumulated state + calls \`_pickProviderAndSubscribe\` again
to fall back to a remaining provider. No user intervention needed.

Manual override: \`client.selectProvider(id)\` unsubscribes from
current + subscribes to the given id. UI dropdown in Commit B will
drive this.

## Flatland integration

- \`FlatlandOptions.name?: string\` — defaults to \`'flatland'\`.
  Lets users distinguish multiple Flatland instances in the UI
  (\`name: 'main-game'\`, \`name: 'minimap'\`).
- Flatland constructs its provider via \`DevtoolsProvider._createSystem\`,
  flagged \`kind: 'system'\`.

## User-created providers

\`new DevtoolsProvider({ name: 'my-engine' })\` — always \`kind: 'user'\`.
When the app also has a Flatland instance, the consumer's preference
rule picks \`user\` so the app's provider is the default selection.
Flatland's system provider sits in the dropdown (Commit B will add the
dropdown).

Bare three.js + R3F-specific helpers (\`createDevtoolsProvider({ scene })\`,
\`<DevtoolsProvider>\` component) are deferred to Commit B.

## Panel behaviour during discovery

The panel mounts immediately when \`createPane\` runs in a
devtools-enabled build. Before discovery completes, liveness shows
\`server: waiting\` + stats show 0/"unknown" placeholders. After
subscribe:ack arrives (~150ms later), values populate. No UI jank —
layout is stable from first paint.

\`DevtoolsState\` gains \`providers: ProviderIdentity[]\` +
\`selectedProviderId: string | null\` so the UI can show the list
(Commit B).

CI verified: typecheck / lint / test / build all green.
Files: packages/devtools/src/devtools-client.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/DevtoolsProducer.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts
Stats: 5 files changed, 720 insertions(+), 381 deletions(-)

### 4eae867094d83640e8518bc2707051cbf633252f
fix: frame-boundary stats + turnkey createPane auto-mount
## Multi-pass frame-counting bug

DevtoolsProducer / StatsCollector were hooking \`scene.onBeforeRender\`
and \`scene.onAfterRender\`, treating every \`renderer.render()\` call
as a separate frame. Flatland runs several internal render passes per
logical frame (SDF pass, occlusion pass, main render, post-processing),
so FPS reported ~6× the real rate (360 instead of 60) and per-render
stats didn't aggregate across passes.

Switched to explicit frame boundaries:

- \`StatsCollector.beginFrame(now, renderer)\` — snapshots
  \`renderer.info.render.calls\` + \`.triangles\` as the "before"
  reference, marks CPU start time.
- \`StatsCollector.endFrame(renderer)\` — computes \`cpuMs\`,
  per-frame \`drawCalls\` + \`triangles\` deltas, increments frame
  counter, updates FPS from interval between consecutive \`endFrame\`
  calls.
- \`DevtoolsProducer.beginFrame(now, renderer)\` / \`endFrame(renderer)\`
  — forward to stats + broadcast a data packet from \`endFrame\`.
- \`Flatland.render()\` wraps its entire body with \`beginFrame\` at
  top + \`endFrame\` at bottom. Every internal \`renderer.render()\`
  contributes to the aggregate totals.

Result: FPS, cpuMs, draw calls, triangles all report the logical
user-visible frame stats, regardless of how many internal passes the
engine runs. Matches the existing stats graph's FPS (which brackets
the whole rAF tick).

Removed the \`scene\` constructor arg from \`DevtoolsProducer\` and
\`StatsCollector\` (nothing hooks the scene anymore). Also removed
\`setAutoSend\` — begin/end IS the timing contract.

Bare three.js apps call \`beginFrame\` / \`endFrame\` around their rAF
tick or their \`renderer.render()\` call — same API, no scene hook
mystery.

## Turnkey createPane auto-mount

\`createPane\` / \`usePane\` now auto-mount the devtools bus panel when
\`debug: true\` (the default). Consumer code doesn't have to call
\`mountDevtoolsPanel\` or \`useDevtoolsPanel\` separately. If no
producer is broadcasting, the panel shows \`server: dead\` + zeros
instead of error. If BroadcastChannel isn't available (test
environments), mount is skipped silently.

Both lighting examples updated to drop the explicit mount calls —
\`createPane({ scene: flatland.scene })\` / \`usePane()\` alone now
produce both the existing stats graph/row AND the new bus-driven
devtools folder.

\`use-pane.test.tsx\`'s strict-mode test opts out via \`debug: false\`
— the test uses \`vi.runAllTimers()\` which infinite-loops on the
ack/liveness \`setInterval\`s; opt-out keeps the test focused on
pane lifecycle.

CI verified: typecheck / lint / test / build all green.
Files: examples/react/lighting/App.tsx, examples/three/lighting/main.ts, packages/devtools/src/create-pane.ts, packages/devtools/src/react/use-pane.test.tsx, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug/DevtoolsProducer.ts, packages/three-flatland/src/debug/StatsCollector.ts
Stats: 7 files changed, 151 insertions(+), 216 deletions(-)

### 54bd0bd92671a353b2ac617e85568e83c92dfcec
refactor: extract DevtoolsProducer, remove stats from prod path
Flatland was holding devtools state directly (bus, subs, collectors,
scratch buffers, tick methods). Extracted all of it into a standalone
\`DevtoolsProducer\` class. Flatland now just constructs one inside its
gate and calls \`dispose()\` on teardown — no timing logic, no packet
building, no state. Anyone with a bare three.js scene + renderer can
instantiate DevtoolsProducer directly and get the same bus protocol.

## Self-driving producer via scene hooks

StatsCollector hooks both \`scene.onBeforeRender\` and
\`scene.onAfterRender\`. These bracket the actual three.js
\`renderer.render()\` call, so:
- \`cpuMs\` is the real three.js render time (not wrapper overhead)
- FPS is derived from the interval between consecutive
  \`onAfterRender\` fires — the true render cadence regardless of who
  called renderer.render
- Frame counter increments per renderer.render call

DevtoolsProducer registers an \`onFrameEnd\` callback on StatsCollector,
so \`send()\` auto-fires from the same hook that captured the stats.
No gap between "stats captured" and "packet emitted." No external
pumping required for the normal case.

\`setAutoSend(false)\` escape hatch for advanced cases (multi-scene
bundling, headless tests, non-standard loops) that want to drive
\`send(renderer)\` manually.

## drawCalls and triangles: per-render deltas

Previously read directly from \`renderer.info.render.drawCalls\` — the
wrong field (three.js uses \`calls\`) and wrong semantic (reports
cumulative when autoReset=false, which misreports in multi-render
frames). Now:
- onBeforeRender snapshots \`info.render.calls\` + \`info.render.triangles\`
  as \`_callsBefore\` / \`_trianglesBefore\`
- onAfterRender computes \`_drawCalls = calls - _callsBefore\`,
  \`_triangles = triangles - _trianglesBefore\`
- fillStats emits these deltas — always "this render's contribution,"
  regardless of autoReset setting

## Removed stats APIs from Flatland (prod-path cleanup)

Flatland had a \`_drawCalls\` field, a \`stats\` getter wrapping
\`spriteGroup.stats\` + overriding drawCalls, and before/after calls
snapshots in render(). All of it ran unconditionally in prod builds,
doing renderer.info math nobody reads. Removed:
- \`Flatland._drawCalls\` field
- \`Flatland.stats\` getter
- \`callsBefore\` capture + delta in render()
- \`drawCalls\` from \`RenderStats\` interface (was always 0 in
  SpriteGroup.stats anyway)

SpriteGroup.stats kept — sprite-domain metrics (spriteCount,
batchCount, visibleSprites) are cheap engine-domain info users need
for game logic (e.g. culling feedback), not renderer-level stats.

mini-breakout's Game.tsx updated to read from spriteGroup.stats
directly (was calling \`flatland.stats\` which no longer exists);
drawCalls in its Stats display is hardcoded 0 — breakout doesn't use
the devtools bus, and the \"drawCalls via bus\" path arrives with the
devtools UI in a later phase.

## send() naming

Named \`send()\` rather than \`tick()\` / \`update()\` — we're a
broadcaster, and \`send\` describes what the method does: push a
packet onto the bus. Internal \`_onFrameEnd\` callback wiring
unchanged.

## Multi-scene caveat documented

three.js has no clean renderer-level per-frame hook. Scene hooks fire
per \`renderer.render(scene, ...)\` call, not per rAF frame. Single-scene
apps (including Flatland) work perfectly; multi-scene apps will see
each render as its own "frame" in stats. Documented in
DevtoolsProducer's docstring with the future escape hatch
(\`setAutoSend(false)\` + manual \`send()\` at the real boundary).

CI verified: typecheck / lint / test / build all green.
Files: minis/breakout/src/Game.tsx, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug/DevtoolsProducer.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/pipeline/SpriteGroup.test.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/pipeline/types.ts
Stats: 7 files changed, 504 insertions(+), 355 deletions(-)

### ff2915eaf6d9b8e880a43818f46455b8cae2b65f
feat: server-side idle ping for consumer liveness
Problem: after the last refactor, the server only emits `data` packets
when at least one feature has fresh content. In a quiet scene (idle
engine, nothing animating), that means the server can go silent
indefinitely. Consumers have no way to distinguish "idle server" from
"dead server", so they'd have to poll via periodic re-subscribe just
to check.

Fix: server emits a dedicated `ping` message when no `data` packet
has been broadcast within `IDLE_PING_MS` (2 s). Pure liveness signal,
empty payload — the message's presence + envelope `ts` is the info.
Consumers treat any server message (`data` / `ping` / `subscribe:ack`)
as proof-of-life; after `SERVER_LIVENESS_MS` (5 s = 2 missed pings) of
total silence they should re-subscribe to recover.

Not a tick-rate heartbeat: the server doesn't ping every interval.
When data flows, pings are never emitted. When data goes quiet, one
ping every 2 s until data resumes or all consumers disconnect. Minimal
wire overhead, symmetric with the consumer's ack flow.

`type: 'ping'` is a distinct discriminator in the message union — not
a nested field inside `data` — so consumers branch cleanly in their
`onmessage` handler.

Scratch `_debugPingScratch` reused every send, same zero-alloc pattern
as `_debugDataScratch`. `_debugLastBroadcastAt` tracks the time of the
most recent outbound broadcast (data or ping); the tick driver checks
it before deciding to emit a ping.

Protocol constants now sit symmetric:
  ACK_INTERVAL_MS    = 1000  consumer ack cadence
  ACK_GRACE_MS       = 3000  server drops consumer (2 missed acks)
  IDLE_PING_MS       = 2000  server emits ping if data silent this long
  SERVER_LIVENESS_MS = 5000  consumer re-subscribes (consumer-side)

Consumer-side `SERVER_LIVENESS_MS` is exported from debug-protocol.ts
so the devtools package / future remote adapters implement the
re-subscribe grace consistently.

CI verified: typecheck / lint / test / build all green.
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts
Stats: 2 files changed, 95 insertions(+), 3 deletions(-)

### 998c84a41f2cac3f2dc52b312a28e00653590556
fix: omit absent delta fields from wire via delete, not undefined
`structuredClone` inside `postMessage` preserves `undefined`-valued own
properties as explicit keys on the clone. Pre-declaring all delta
fields on scratch objects and resetting them to `undefined` each tick
caused every data packet to ship `{ drawCalls: undefined, triangles:
undefined, ... }` — wire bloat per frame + confusing consumer console
output that looked like the protocol was emitting junk.

Per protocol: absent = no change. So the fields must be *absent*, not
present-with-undefined.

Switch from `out.field = undefined` to `delete out.field` on:
- StatsCollector.fillStats field reset
- Flatland._tickDebug features slot reset + env scratch reset
- Scratch initialisation (`{}` instead of all-fields-undefined)

Minor V8 hidden-class churn from delete, negligible at 60 Hz on tiny
objects. Wire is now clean: consumer only sees keys that actually
changed this tick. First-tick full snapshot after subscribe still
works via resetDelta().
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug/EnvCollector.ts, packages/three-flatland/src/debug/StatsCollector.ts
Stats: 3 files changed, 42 insertions(+), 45 deletions(-)

### a2a835c2a1dfa17ee3fe24beabef29ca1b5fa0a9
refactor: collapse debug bus topics → subscribe/ack + bundled data packets
Replaces the per-topic ping/pong heartbeat with an ack-driven
subscription protocol and bundles all active feature payloads into a
single `data` message per tick. Simpler protocol, fewer messages, fewer
postMessage calls, per-consumer state tracking.

## Protocol shape

Messages (all gated by DEVTOOLS_BUNDLED):

  consumer → server:   `subscribe { id, features }`
  server   → consumer: `subscribe:ack { id, features, env }`
  server   → broadcast: `data { frame, features: {...} }`  per tick, when changed
  consumer → server:   `ack { id }`           ~1 Hz, starts on ack receipt
  consumer → server:   `unsubscribe { id }`   explicit leave

  consumer ↔ consumer: `rpc:*` messages (server ignores, require target id)

Heartbeat is implicit — no separate ping/pong traffic. Consumer ack
cadence is 1 s; server drops after 3 s of silence (2 missed acks of
grace). Self-healing: `subscribe` is idempotent on same id, so a laggy
or dropped consumer recovers by just re-subscribing — the normal
subscribe path IS the reconnect path.

## Features collapsed

Former topics `stats:frame` + `stats:gpuReady` are now a single `stats`
feature whose payload optionally carries `gpuMs` / `gpuFrame`. Server
caches the latest resolved GPU timing between async readbacks so the
stats payload can carry a stable value on frames where no new readback
arrived. When the resolve queue goes stale (`FEATURE_STALE_MS = 2 s`),
server emits `gpuMs: null` once to tell consumers to clear their
display, then omits it until a new resolve arrives.

Features list: `stats | env | atlas:tick | atlas:fullscreen | registry`
(atlas + registry are stubs; payloads land in Phases B–D).

## Delta encoding + zero-alloc hot path

- Every payload field is `T | null | undefined`: absent = no change,
  null = clear, value = new. Only server-emitted messages are
  delta-encoded; consumer messages (subscribe/ack/unsubscribe) carry
  full payloads.
- `DataPayload.frame` is set on every emitted packet (metadata, not a
  heartbeat — ties the packet to a specific engine render). Absent
  packets == no changes; silence is a valid state.
- Collectors hold scratch `_prev` snapshots and write deltas into
  caller-owned scratch payloads. Flatland owns one `data` message
  scratch plus scratch slots for each feature; mutates per tick, posts
  via `structuredClone`-inside-postMessage. Zero allocations on the
  hot path past `_initDebug`.
- `resetDelta()` on every `subscribe` forces a full snapshot on the
  next tick so late-joining consumers initialise correctly. Existing
  consumers just overwrite their state with identical values —
  idempotent.

## Subscribe:ack carries bootstrap env

One-shot full env snapshot (versions + backend capabilities + canvas
dims) included in `subscribe:ack.env`. Consumers know upfront whether
GPU timestamp queries are available (Safari WebGPU: no) without having
to subscribe to `env` just to find out. `recordSnapshotAsPrev` after
the bootstrap so subsequent `env` feature deltas compute relative to
what the consumer already has.

## Broadcast-with-shared-prev is correct

Server maintains a single `_prev` per feature, not per consumer id.
Correctness proof: any `subscribe` resets all feature deltas and the
next tick emits full snapshots; existing consumers overwrite their
state with identical values (no-op); new consumer initialises. After
the full snapshot, all consumers track the shared prev consistently.
Per-id scratch would only matter under unicast (different payload to
different consumers), which BroadcastChannel doesn't support anyway.

## Known gap: missed-packet recovery

If BroadcastChannel drops a delta packet (tab throttling, OS hiccup),
consumer state goes out of sync relative to `_prev`. Consumer can
detect via `DataPayload.frame` gaps (monotonic) and re-subscribe. Not
wired in v1 — docs note consumers are "show what I have" and a stale
display for a few ticks is acceptable. Revisit with periodic
full-snapshots if it becomes a real problem.

## Broadcast-to-all RPC deferred

`rpc:*` messages require `target: string` (recipient consumer id). No
broadcast in v1 — day-1 use cases are all directed (pop-out window
syncing with its opener). Add `target?: string` later as a backward-
compatible extension if multi-consumer broadcast becomes real.

## File changes

- `debug-protocol.ts` — rewritten: new message types, feature taxonomy,
  delta semantics doc, envelope+body helpers, stampMessage mutating
  in place, no wire codec (native structuredClone is fast enough for
  same-process; compression belongs in a future WebSocket adapter).
- `debug/Heartbeat.ts` — deleted; superseded by `SubscriberRegistry`.
- `debug/SubscriberRegistry.ts` — NEW: Map<id, {features, lastAckAt}>,
  lazy-cached union of active features, pruneStale() for ack timeouts.
- `debug/StatsCollector.ts` — refactored: `fillStats(out)` + frame
  getter; owns gpu timing resolve & cache; no longer dispatches
  messages directly.
- `debug/EnvCollector.ts` — refactored: `snapshot(renderer)` for
  subscribe:ack bootstrap + `fillEnv(out, renderer)` for deltas +
  `recordSnapshotAsPrev` to sync prev after bootstrap.
- `Flatland.ts` — drives the tick in `render()`: prune stale, build
  scratch `data` packet via `fillStats` / `fillEnv`, post once if any
  feature changed. Bus handler routes subscribe/ack/unsubscribe.
  Serializes `subscribe:ack` with bootstrap env.

CI verified: pnpm typecheck / lint / test / build all green.
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/EnvCollector.ts, packages/three-flatland/src/debug/Heartbeat.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/debug/SubscriberRegistry.ts
Stats: 6 files changed, 923 insertions(+), 678 deletions(-)

### b2f68a87fcf201519c71377a008355dcac9f3324
feat: debug protocol refinements — timestamps, delta encoding, env producer, zero-alloc hot path
Layers on top of the initial Phase A landing (4181949). Three
conceptually separate refinements folded into one checkpoint since they
all touch the same producer files and build on each other. All gated by
DEVTOOLS_BUNDLED, tree-shaken in prod-no-flags builds.

## Timestamps on every message

New `ts: number` (`Date.now()`) on the envelope so subscribers can graph
data on a real time axis, compute latency, and order messages across a
pop-out window / websocket transport. Envelope extracted into
`DebugMessageEnvelope` intersected with the type union so the schema
stays clean. Added `stampMessage(body)` which now mutates its input in
place — zero envelope allocations per send when callers hold scratch
message objects.

## Delta encoding for high-frequency payloads

`stats:frame` fields are individually optional + nullable per the bus's
cumulative semantics: absent field = no change from last dispatch; null
= clear to undefined. Only the monotonic `frame` counter is always
present (doubles as 'producer alive' heartbeat).

Delta tracker (`_lastStatsFrame`) reset on every `ui:subscribe` for
`stats:frame` so late-joining consumers receive a full snapshot on the
next tick rather than accumulating from partial deltas.

Delta semantics documented in a new block-comment at the top of
`debug-protocol.ts` so third-party subscribers implementing the
cumulative-state pattern don't have to reverse-engineer it.

## Env info producer

New `env:info` topic + `EnvCollector`. Carries:
- `threeFlatlandVersion` / `threeRevision` (fixed at build time)
- `backend.{name, trackTimestamp, disjoint, gpuModeEnabled}` (fixed at
  renderer construction)
- `canvas.{width, height, pixelRatio}` (runtime-variable on resize)

Heartbeat-gated like the rest: producer does nothing when no one's
subscribed. First dispatch after subscribe is a full snapshot; subsequent
dispatches are delta-encoded and post only when something actually
changed (in practice, just canvas dims on window resize). Nested
`backend` / `canvas` sub-objects are themselves delta-encoded with their
own optional/nullable fields.

Re-subscribe path: `ui:subscribe` for `env:info` calls
`EnvCollector.resetDelta()` so the next dispatch is a full snapshot
again. Same mechanism as `StatsCollector.resetDelta()` — the normal
subscribe path IS the re-query path.

## Zero-allocation hot path

`stats:frame` dispatches 60 times per second when active — allocations
in the producer directly hit the main thread budget. Refactored to a
scratch-object pattern:

- `_statsFrameScratch: DebugMessage` — full message envelope + payload
  constructed once at producer init, mutated in place every send.
- `stampMessage` mutates in place instead of returning a new object
  (matches the scratch flow).
- `structuredClone` inside `bus.postMessage` gives subscribers an
  independent copy, so the producer can mutate the scratch on the very
  next call without interference.
- Payload shape declared fully (all delta fields set to `undefined`) so
  V8 picks a stable hidden class; no shape churn across frames.
- Same pattern for `_statsGpuScratch` and `Heartbeat._pingScratch`.

Net: ~0 allocations per send for `stats:frame`, `stats:gpuReady`, and
`ui:ping` past producer construction. Payload construction still has
the delta-diff bookkeeping but writes through the same scratch rather
than allocating a fresh object.

## Wire-format codec (NOT shipped)

Investigated compressing field names at the wire boundary
(`drawCalls`→`dc`, etc.) but the JS-level object rekeying + extra
allocation cost more than `structuredClone` itself, which is native-code
and already fast for same-process `BroadcastChannel`. Left a comment in
`debug-protocol.ts` explaining that compression belongs in the eventual
`WebSocketTransport` adapter — scoped to where wire bytes actually
matter, not here.

## Other

- `_flushPendingChannelValidation()` exposed as a doc'd internal method
  (leading underscore) so headless tests can drain the pending-sprite
  validation set without a renderer. `Flatland.render()` calls it
  automatically in production.
- `StatsCollector._post(msg)` takes a scratch `DebugMessage` by
  reference; centralises `stampMessage` + `try/postMessage/catch`.
- `EnvCollector` keeps its send site inline (single call site; helper
  would be dead-weight abstraction).

CI verified: pnpm typecheck / lint / test / build all green.
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/EnvCollector.ts, packages/three-flatland/src/debug/Heartbeat.ts, packages/three-flatland/src/debug/StatsCollector.ts
Stats: 5 files changed, 505 insertions(+), 55 deletions(-)

### 3f47a7f88a0edcdc615350f5545b0df88056bca1
feat: devtools bus + stats producer (Phase A) + debug-buffer-atlas plan
Introduces the producer side of a dev-only debug bus. The consumer
(tweakpane UI, buffer atlas, fullscreen overlay) lands in later phases;
this commit only ships the transport, protocol types, stats collection,
and liveness heartbeat — all gated to drop to zero bytes/runtime cost
in plain prod builds.

**Two-layer gate** (in three-flatland/debug-protocol.ts):
- DEVTOOLS_BUNDLED — a module-scoped const evaluated from
  import.meta.env.DEV || import.meta.env.VITE_FLATLAND_DEVTOOLS === 'true'.
  Vite/esbuild/rollup inline these at build time; when both are falsy,
  the const folds to false and every `if (DEVTOOLS_BUNDLED)` branch is
  dead code. Terser removes it. Tree-shake guarantee, not tree-shake
  hope.
- isDevtoolsActive() — runtime second-layer check, only reachable when
  DEVTOOLS_BUNDLED is true. Reads window.__FLATLAND_DEVTOOLS__ as an
  opt-out (false disables an otherwise-bundled build). Can't enable
  what isn't bundled — rogue clients can't "hack devtools on" in prod.

**Public API contract — `three-flatland/debug-protocol` sub-export:**
Types-only module (plus two constants: DEBUG_CHANNEL string and version
ints). Defines the DebugMessage discriminated union, topic taxonomy,
format hints, and timing constants. This is what any third-party bus
subscriber (chrome extension, websocket bridge, custom dashboard)
imports. Public via `three-flatland/debug-protocol`.

**Producer-driven ping/pong heartbeat (Heartbeat.ts):**
Tracks per-topic subscriber liveness via producer-initiated pings.
- Subscriber sends ui:subscribe {topic} once.
- Producer registers the topic, starts a 1s ping interval broadcasting
  ui:ping {topic}.
- Subscribers respond with ui:pong {topic} on each ping received.
- If no pong arrives within PONG_WINDOW_MS (3s = 2 missed-ping grace),
  the topic is dropped. When all topics die, the interval clears
  entirely — zero recurring work until the next subscribe.
- Self-healing via re-subscribe: a laggy subscriber that misses pongs
  and gets dropped simply sends ui:subscribe again. ui:subscribe is
  idempotent; the normal subscribe path IS the reconnect path.
  Subscribers detect drop by watching for pings — no pings for ~2× the
  interval means they've been dropped.

**Stats producer (StatsCollector.ts):**
Chains scene.onAfterRender (preserves any pre-existing hook, restored
on dispose). Each render: if the stats:frame topic is active per the
Heartbeat, reads renderer.info.render/memory and dispatches a
stats:frame payload (drawCalls, triangles, geometries, textures, fps).
Rolling-average FPS anchored to Flatland.render() cadence (not browser
repaint), updated every 500ms.

GPU timestamps resolved async via resolveTimestampsAsync, gated on
stats:gpu topic and an in-flight guard to prevent pool-drain pile-up.
Dispatched as stats:gpuReady keyed by frame number so consumers can
correlate late-arriving GPU times with the frame that produced them.

**Flatland integration:**
- New fields: _debugBus, _debugPings, _debugStats (all null unless
  DEVTOOLS_BUNDLED && isDevtoolsActive() at construction).
- _initDebug() constructs BroadcastChannel('flatland-debug') +
  Heartbeat + StatsCollector, wires bus message events → heartbeat.
- _disposeDebug() tears down in reverse; idempotent.
- render() calls _debugStats?.beginFrame(performance.now()) to anchor
  FPS on engine rate.
- Channel-validation drain extracted to _flushPendingChannelValidation()
  so tests can drain without a renderer (replaces the implicit drain
  inside render()'s body). Existing behavior preserved.

**Plan document: planning/experiments/Debug-Buffer-Atlas.md**
Full design brief for the in-progress debug system:
- Goals, non-goals, package split (core interface vs separate consumer
  package — devtools here is the consumer, coming in Phase B/C).
- Dynamic-import opt-in pattern for consumers.
- Format taxonomy (rgba8, sdf-distance, depth-linear, normal-xyz,
  tile-light-count/indices, cpu-array).
- Two-phase GPU pipeline (Phase 1: write-to-atlas at throttled tick;
  Phase 2: tier 1 copyTextureToTexture or tier 2 blit shader into a
  tweakpane canvas) + Phase 3 fullscreen overlay.
- Topic list and heartbeat wiring.
- Zero-cost-enforcement mechanisms (ESLint no-restricted-imports, CI
  bundle-grep, sideEffects: false, no top-level registrations).
- Phased rollout with parallelism markers per phase.
- Spike list: three-flatland RenderTarget usage flags, renderer.getDevice
  exposure, tweakpane fold event, two-GPUCanvasContext proof-of-concept.

**Producer-side verified in dev:** console paste of a BroadcastChannel
subscriber + pong responder sees stats:frame ticking every render,
stats:gpuReady arriving async. Setting
window.__FLATLAND_DEVTOOLS__=false before reload silences the bus —
the disable path works. Prod-style bundle elimination test requires
a `vite build` of an example; deferred to CI.

CI verified: pnpm typecheck / lint / test / build all green.
Files: packages/three-flatland/package.json, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug-protocol.ts, packages/three-flatland/src/debug/Heartbeat.ts, packages/three-flatland/src/debug/StatsCollector.ts, packages/three-flatland/src/lighting-channel-validation.test.ts, planning/experiments/Debug-Buffer-Atlas.md
Stats: 7 files changed, 1182 insertions(+), 3 deletions(-)

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

### 191a106fc96cc3330bb67ab522de9eea3a458038
refactor: remove sdfGenerator mirror on LightingContext
Follow-up to the ECS trait + system refactor. The previous landing
kept a mirrored sdfGenerator handle on LightingContext for consumer
backwards-compat — same value as pipeline.sdfGenerator, copied by
shadowPipelineSystem each frame. That's two writes where one
suffices and it opened a hard-to-debug class of regression: a future
edit that forgot to mirror would silently desync, effects would see
a stale or null handle, and "shadows just stopped working after that
unrelated change" is the exact footgun we're trying to avoid.

Now `ShadowPipeline.sdfGenerator` is the sole owner. `lightEffectSystem`
queries the trait directly when building the per-effect runtime
context each frame; `LightEffectRuntimeContext.sdfGenerator` stays
typed the same so effect-side code (RadianceLightEffect.update, future
shadow-sampling shaders) is unchanged.

Changes:
- Drop `sdfGenerator` field from LightingContext trait and from the
  `LightingContextData` interface in Flatland.
- lightEffectSystem queries ShadowPipeline each tick and passes the
  resolved handle into the effect's runtime context.
- shadowPipelineSystem no longer pokes LightingContext on
  allocation/teardown — it just manages its own trait.
- Flatland's setLighting + _ensureLightingContext stop setting
  sdfGenerator in the LightingContext payload.
- Unused SDFGenerator type import dropped from Flatland.

Performance:
- Replaces a per-frame cross-trait write with a cached query lookup.
  Koota caches queries by trait signature (same pattern existing
  systems rely on), so this is O(1) after warmup.
- Scratch Vector2 usage in lightEffectSystem is unchanged.
- Trait access stays in place-mutate mode (no entity.set churn).

Shadow pipeline test updated: asserts LightingContext does NOT carry
sdfGenerator, and lightEffectSystem still runs cleanly. Guards against
regression to a double-sourced layout.

447 tests pass. Typecheck clean.

Refs #11 #14 #16.
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/systems/lightEffectSystem.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/shadow-pipeline.test.ts
Stats: 5 files changed, 32 insertions(+), 18 deletions(-)

### 9a0ba0c9d2c7e291fbdaa4ce3e4a5922ee49c29b
refactor: move shadow pipeline state to ECS trait + system
Flatland was accreting state as slice C2 landed — six private fields,
one ensure-method, and three call-site integrations for a concern that
has nothing to do with "this is the Flatland instance." The LightEffect
architecture already has an optimized, ECS-native state system (via
factory-function trait data, same pattern LightingContext uses); the
shadow pipeline had no reason to opt out of it.

What moved:

- New `ShadowPipeline` singleton trait in ecs/traits.ts holding
  `sdfGenerator`, `occlusionPass`, `width`, `height`, `initialized`.
  Factory-function trait so consumers read via `entity.get(Trait)`
  (O(1) pointer deref — no clone, no per-get allocation) and mutate
  fields in place.
- New `shadowPipelineSystem` in ecs/systems/. Owns the full lifecycle:
  allocate when active effect declares needsShadows, init on first
  run with a concrete renderer size, resize only on dimension change,
  run the occlusion pre-pass + JFA each frame, dispose on detach.
  Writes the live SDFGenerator handle back to LightingContext so
  downstream effects (RadianceLightEffect.update, future shadow-sampling
  shaders) see it via their existing trait field without any new API.
- New `scene: Scene | null` field on `LightingContext` — the pre-pass
  needs the scene and walking up from the camera was fragile
  (Flatland's camera is not a scene child). Flatland populates this
  each frame next to renderer + camera in render().

What shrunk on Flatland:

- Removed fields: _sdfGenerator, _occlusionPass, _shadowRTWidth,
  _shadowRTHeight, _shadowInitialized.
- Removed method: _ensureShadowPipelineSize.
- Removed the inline pre-pass block from render().
- setLighting's instantiate/teardown fork collapses to one call —
  _ensureShadowPipelineEntity() — with the system owning the rest.
- dispose() releases trait-owned GPU resources by destroying the
  singleton entity.

Performance notes:

- The hot path (shadows active, size unchanged) is: two cached query
  lookups, four reference fetches, two branch checks, then the
  render calls. No allocations beyond the single module-scope
  Vector2 scratch used for renderer.getSize.
- Trait fields are mutated in place (pipeline.initialized = true).
  entity.set() would fire Changed() wakeups; mutation doesn't,
  matching the pattern in lightEffectSystem where the active-effect
  update mutates ctx.initialized directly.
- Allocation of SDFGenerator/OcclusionPass only occurs on the first
  system tick after setLighting — Flatland's bootstrap is just
  trait presence, not GPU resources.

Tests rewritten to query the trait instead of reading private Flatland
fields. All 447 tests still pass.

Refs #11 #14 #16.
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/systems/index.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/shadow-pipeline.test.ts
Stats: 5 files changed, 297 insertions(+), 130 deletions(-)

### 790eb602696973329012047000c621a9fa61b66f
feat: wire SDFGenerator + OcclusionPass into Flatland (C2)
Closes the last CPU-side gap in the SDF-Shadow-Plumbing plan: the
generators now instantiate, run per-frame, and dispose along with the
rest of Flatland's lifecycle.

setLighting(effect):
- When the effect's class declares `needsShadows = true`, allocate a
  SDFGenerator and an OcclusionPass. Construction is cheap — no GPU
  resources until first render when renderer size is known.
- When switching to a non-shadow effect, dispose both and null out.
- Same-family re-setLighting (both needsShadows) reuses the existing
  instances to avoid GPU resource churn.

render():
- New pre-pass slot between the ECS schedule's completion and the main
  render. If the pipeline is active:
  1. _ensureShadowPipelineSize tracks viewport size — first frame
     calls sdfGenerator.init(), subsequent frames only resize when
     dimensions actually change. Cheap size comparison in the common
     case.
  2. OcclusionPass.render walks the scene, swaps SpriteBatch materials
     to its per-texture occlusion variants, and emits the silhouette
     RT. Restores materials on completion.
  3. SDFGenerator.generate JFAs the occlusion RT into the final
     `sdfTexture`.

dispose():
- Releases the new _occlusionPass alongside the existing _sdfGenerator
  teardown. Resets the size tracker so a re-attached pipeline starts
  fresh.

Shadow consumption in the fragment path is still a stub — replacing
the `shadow = float(1.0)` placeholder in DefaultLightEffect /
DirectLightEffect with a real SDF sphere trace is T6/T7 of the
plumbing plan. This commit ships the plumbing so the sdfTexture is
reliably available on LightEffectRuntimeContext via
LightingContext.sdfGenerator; T6/T7 consumes it.

6 unit tests cover: non-shadow effect leaves pipeline null, shadow
effect instantiates, switching tears down, switching same-family
reuses instances, dispose() releases.

Refs #11 #14 #16.
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/shadow-pipeline.test.ts
Stats: 2 files changed, 187 insertions(+), 1 deletion(-)

### dca3329c98e6be4d5a7711ef92f00f931ca17aa4
feat: OcclusionPass now masks alpha by castsShadow per instance
Slice 3 of SDF-Shadow-Plumbing. Closes the loop from
sprite.castsShadow → batch attribute → shader → SDF seed.

OcclusionPass.render now swaps each SpriteBatch's material to a
per-texture occlusion variant before rendering into the occlusion RT,
then restores the originals. The occlusion material:

  1. Replicates Sprite2DMaterial's instance-UV flip + atlas remap so
     each sprite samples its own frame out of the shared atlas.
  2. Samples atlas alpha at the remapped UV.
  3. Reads castsShadow (bit 2 of effectBuf0.x) per instance via the
     existing readCastShadowFlag() TSL helper.
  4. Outputs vec4(0, 0, 0, alpha * castMask) — casters contribute
     their silhouette, non-casters contribute nothing.

Material caching:
- Per-source-texture cache (Map<Texture, MeshBasicNodeMaterial>) on
  the OcclusionPass. First render with a given atlas mints the
  material; subsequent frames reuse.
- dispose() disposes all cached materials and clears the map.

Zero-alloc traverse:
- scene.traverse callback is a bound arrow function stored on the
  instance, not allocated per frame.
- Two parallel arrays (_swappedMeshes, _swappedOriginals) reused
  across frames via length = 0 — matches the Sprite2D / transform
  sync convention of no per-frame allocation past warmup.
- Material restore runs in reverse order so array.length = 0 clears
  without per-element delete cost.

Known limitation (called out inline): the occlusion shader duplicates
the instance-UV remap from Sprite2DMaterial._buildBaseColor. If that
math changes (e.g., a new instanceUVOffset), this material must be
updated in lockstep. No shared helper yet — revisit if we grow a
third consumer.

Still not wired end-to-end: Flatland._sdfGenerator is never
instantiated. OcclusionPass is complete and unit-tested in isolation
but will only run when C2 (Flatland pipeline wire-up) lands.

Refs #11 #12 #14 #16.
Files: packages/three-flatland/src/lights/OcclusionPass.test.ts, packages/three-flatland/src/lights/OcclusionPass.ts
Stats: 2 files changed, 169 insertions(+), 6 deletions(-)

### abd4b5a79b6444967e40eea341122f06e1606fb4
refactor: split system flags and effect enable bits across effectBuf0.x/y
effectBuf0 is a vec4 per-instance attribute that was previously using
only the .x component — .y/.z/.w were allocated, uploaded every frame,
and left as zero padding. This change gives the already-paid-for
bandwidth a job and recovers user-visible MaterialEffect capacity.

New component layout:
  effectBuf0.x  system flags        (24 bits, 3 used — lit, receiveShadows, castsShadow)
  effectBuf0.y  effect enable bits  (24 slots — one bit per registered effect)
  effectBuf0.z  reserved — next overflow target
  effectBuf0.w  reserved — next overflow target

Before: 21 user MaterialEffect slots mixed into .x alongside 3 system
flags.
After:  24 user MaterialEffect slots in .y; system flags stand alone
        in .x with 21 free bits for future use.

Implementation:
- Sprite2D gains _effectEnableBits alongside _effectFlags. addEffect /
  removeEffect operate on the new field; lit / receiveShadows /
  castsShadow setters continue to operate on _effectFlags only.
- _writeEffectDataOwn, _syncEffectFlagsToBatch, bufferSyncSystem,
  batchAssignSystem, batchReassignSystem all issue a second
  writeEffectSlot targeting component 1 (.y) for the enable bits.
- EffectMaterial.registerEffect reserves slot 1 for enable bits, so
  effect field data now starts at slot 2 (effectBuf0.z). _effectTotalFloats
  becomes `2 + data` instead of `1 + data`.
- _rebuildColorNode reads the enable-bit flags from component 1
  (getPackedComponent(bufNodes, 1)) instead of pulling them out of the
  shared system-flag word in x.
- EFFECT_BIT_OFFSET becomes 0 (effect bits start at bit 0 of their own
  component). Exported name retained so callers that compute
  per-effect masks via `1 << (EFFECT_BIT_OFFSET + i)` stay robust.

Tests updated: slot offsets in _effectSlots move up by 1, array[]
indices for effect field reads shift from [1]→[2] and [2]→[3],
_effectFlags assertions that previously combined system+enable bits
are split into separate _effectFlags and _effectEnableBits checks.

No hot-path cost change: the second writeEffectSlot per sprite update
is the same cost as the one it replaces — dirtyMin/dirtyMax cover
adjacent components in the same attribute. Shader reads one extra
component-accessor node. GPU bandwidth unchanged.

Refs #11 #12 #14 #16.
Files: packages/three-flatland/src/ecs/systems/batchAssignSystem.ts, packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/ecs/systems/bufferSyncSystem.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/MaterialEffect.test.ts, packages/three-flatland/src/materials/effectFlagBits.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/sprites/castsShadow.test.ts
Stats: 8 files changed, 178 insertions(+), 107 deletions(-)

### 5fab79a8be563ad8323cef69fc05f102c45fe11b
feat: per-instance castsShadow flag (bit 2 of effectBuf0.x)
Slice 2 of the SDF-Shadow-Plumbing plan. Reserves bit 2 of _effectFlags
for the per-sprite shadow-caster flag and wires it through the same
zero-rebuild path as lit and receiveShadows: setter does a bit flip,
then either _syncEffectFlagsToBatch() (batched → one
mesh.writeEffectSlot) or _writeEffectDataOwn() (standalone → geometry
buffer). No Changed() trigger, no material rebuild, no batch rebuild.

Bit layout:
  bit 0   lit               (default on)
  bit 1   receiveShadows    (default on)
  bit 2   castsShadow       (default off — opt in)
  bit 3+  MaterialEffect enable bits (EFFECT_BIT_OFFSET = 3)

User-available MaterialEffect slots go from 22 → 21 as a result; the
sprite batch's effectBuf0.x Float32 keeps all values inside the 24-bit
mantissa range.

Packaging note: the four flag constants (LIT_FLAG_MASK,
RECEIVE_SHADOWS_MASK, CAST_SHADOW_MASK, EFFECT_BIT_OFFSET) move to
their own module at `materials/effectFlagBits.ts`. EffectMaterial can
now import directly without a Sprite2D →
Sprite2DMaterial → EffectMaterial → Sprite2D cycle, which previously
forced the "const EFFECT_BIT_OFFSET = 2 // must match Sprite2D.ts"
duplication. Sprite2D re-exports the constants so existing callers of
`import { LIT_FLAG_MASK } from '.../Sprite2D'` keep working.

Also adds readCastShadowFlag() in wrapWithLightFlags.ts — mirrors
readReceiveShadowsFlag() exactly, reads effectBuf0.x, masks
CAST_SHADOW_MASK. Consumed by the upcoming occlusion-pass material in
slice 3.

Test bookkeeping: MaterialEffect.test.ts previously hardcoded magic
numbers (DEFAULT_FLAGS | 4, | 8, | 12, | 28, | 124) that encoded the
old offset. Refactored to compute masks from EFFECT_BIT_OFFSET via
E0..E4 helpers, so future bit-layout changes don't trigger another
mass edit. 6 new unit tests in castsShadow.test.ts cover default,
setter, bit isolation, no-op re-set, constant invariants, and
coexistence with the other system flags.

Refs #11 #14 #16.
Files: packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/lights/wrapWithLightFlags.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/MaterialEffect.test.ts, packages/three-flatland/src/materials/effectFlagBits.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/sprites/castsShadow.test.ts, packages/three-flatland/src/sprites/types.ts
Stats: 8 files changed, 219 insertions(+), 55 deletions(-)

### 5e3ef0e02b6cf6712d3bf336de808fe027f97150
feat: dev-time warning for unsatisfied channel providers
When a lit sprite is attached to a Flatland whose LightEffect declares
channel `requires: ['normal']` etc., but the sprite carries no
MaterialEffect that `provides` those channels, lighting silently falls
back to `channelDefaults` (flat normals, etc.). The visual result is
"lighting looks subtly wrong" with no actionable signal — an hour of
staring at the shader before remembering AutoNormalProvider exists.

Adds a non-production check run from:
- `setLighting(effect)` — walks all currently-attached sprites
- `add(sprite)` — validates the one sprite being added

Emits one warning per lit sprite with missing providers, deduped via a
WeakSet so re-attach / re-add doesn't spam. The message lists the
specific missing channels and the active LightEffect's name so the fix
is obvious.

Enumeration goes through the ECS BatchRegistry.spriteArr — the
canonical source of sprite membership — rather than a parallel
collection on Flatland. Sprites enroll into the batch directly and do
not become scene-graph children of SpriteGroup, so relying on the
registry keeps us ECS-pure and avoids the book-keeping drift of a
reverse map.

Warnings are suppressed under NODE_ENV=production; no production
overhead beyond a single env-var check per attach/add.

5 unit tests cover: warning path, provider-satisfied path, unlit
sprite skipped, WeakSet dedup, and sprites attached before
setLighting().

Refs #16.
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/lighting-channel-validation.test.ts
Stats: 2 files changed, 185 insertions(+)

### 4178993e8f1ac12c5f7388199df0eb3793d1a36e
feat: narrow channelNode return type to provided ChannelNodeMap shape
createMaterialEffect is now generic over the declared `provides` tuple.
The channelNode callback's return type is constrained to
`ChannelNodeMap[C[number]]`, so a provider that claims `provides: ['normal']`
must actually return `Node<'vec3'>` — returning `Node<'float'>` now fails
`tsc --noEmit` with TS2322 at the factory call site, rather than silently
compiling and producing a shader that mixes normal into the wrong slot
at runtime.

Secondary guarantee: omitting `provides` but supplying a channelNode now
fails at the type level (`channelNode: never` for the empty-tuple case).
Before, you could declare a channelNode without any provides; the
runtime `channelDefaults` fallback would win silently.

Added MaterialEffect.type-test.ts with a positive case (inline) plus
commented negative cases that document the expected error text. These
run through tsc as part of the package typecheck — uncommenting a
negative case is a local-only way to verify the constraint still bites
over time. Verified at commit time by dropping a _neg.ts sidecar into
the package and confirming tsc emits TS2322.

No runtime changes. The class-side erasure to `(ch: string, ctx) => Node`
is preserved via a narrow unknown cast so the internal dispatcher in
EffectMaterial still works identically.

Refs #16.
Files: packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/materials/MaterialEffect.type-test.ts
Stats: 2 files changed, 96 insertions(+), 11 deletions(-)

### 85ed21978c0b1d412d1295636e392bf2c7c7d55c
feat: OcclusionPass render target + resize lifecycle (C1)
First half of the SDF-Shadow-Plumbing plan. Adds OcclusionPass — a
dedicated offscreen pass that renders the host scene into a
resolution-scaled render target whose alpha channel carries the
occluder silhouette. Consumed downstream by SDFGenerator to seed the
JFA.

Design choices for this slice:
- Resolution defaults to 0.5x viewport (trades shadow fidelity for
  shadow cost). Overridable per instance.
- NearestFilter on the RT texture to match SDFGenerator's seed pass.
- RT reference stays stable across resizes so TSL texture-node bindings
  captured at build time remain valid.
- render(scene, camera) saves and restores the renderer's render target
  and scene.background. Clear color is set fresh each frame by the
  caller, so restoration is deliberately skipped (Color4 isn't in the
  public three type export anyway).

Deliberately NOT in this commit:
- Per-sprite castShadow filtering — SpriteGroup batches all sprites
  into a single draw, so per-object visibility or layer tricks do not
  discriminate. Follow-up commit threads castShadow through the batch
  attribute buffers so non-casters emit alpha = 0 from inside the
  sprite material.
- An occlusion-specific material — scene.overrideMaterial loses the
  per-object TSL texture bindings, so rendering with the existing
  sprite materials is the cleanest path until the attribute-level
  filter lands.

Object3D already ships `castShadow` (singular, inherited) so T1 is a
zero-code change — the API is already on every Sprite2D. The batch
filter above will consume that existing flag.

9 unit tests cover resize math, scale clamping, reference stability,
filter default, and dispose safety. No render-path tests yet — those
arrive with C5 visual validation in examples/react/lighting.

Refs #11 #16.
Files: packages/three-flatland/src/lights/OcclusionPass.test.ts, packages/three-flatland/src/lights/OcclusionPass.ts, packages/three-flatland/src/lights/index.ts
Stats: 3 files changed, 214 insertions(+)

### 28e4e71a6ab1810c97416de523b8968b64a9da2e
feat: reservoir-based tile overflow by importance
The Forward+ tile-light assignment previously dropped any light past the
16th in submission order, which produces tile-edge flicker as soon as
local light density exceeds the per-tile cap. Lights in dense clusters
would appear or disappear based on scene-graph ordering rather than
contribution.

Replace the silent-drop path with:

- Per-light × tile score = intensity falloff evaluated against the
  closest point on the tile's world-space AABB (so lights inside a tile
  always win). Directional lights take the full intensity score;
  ambient lights remain excluded from tiling.
- Distance cutoff short-circuits before insertion, skipping tiles the
  light cannot reach.
- When a tile is full, scan the 16-slot reservoir for the weakest
  occupant and evict only on strictly greater score (no thrash on
  ties, preserving first-come-first-served when all lights are equal).

CPU-only change; no shader changes. The per-tile score array adds
1 KB/tile at 16 lights — trivial vs. the existing tile DataTexture.

Overflow now degrades gracefully to the most-contributing lights
instead of producing flicker, which is the core issue called out in
the stochastic-tile-based-lighting research spec.

Refs #12.
Files: packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts
Stats: 2 files changed, 189 insertions(+), 14 deletions(-)

### e62207ad692bd8b26142c2c4d067b1ab468affd3
feat: lighting and lighting effects work
Files: docs/astro.config.mjs, docs/src/content/docs/examples/lighting.mdx, docs/src/content/docs/guides/flatland.mdx, docs/src/content/docs/guides/lighting.mdx, examples/react/pass-effects/App.tsx, examples/three/tilemap/index.html, packages/presets/src/index.ts, packages/presets/src/lighting/AutoNormalProvider.ts, packages/presets/src/lighting/DefaultLightEffect.ts, packages/presets/src/lighting/DirectLightEffect.ts, packages/presets/src/lighting/NormalMapProvider.ts, packages/presets/src/lighting/RadianceLightEffect.ts, packages/presets/src/lighting/SimpleLightEffect.ts, packages/presets/src/lighting/index.ts, packages/presets/src/react.ts, packages/presets/src/react/index.ts, packages/presets/src/react/lighting/index.ts, packages/presets/src/react/types.ts, packages/presets/tsup.config.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/SystemSchedule.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/index.ts, packages/three-flatland/src/ecs/systems/batchAssignSystem.ts, packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/ecs/systems/batchRemoveSystem.ts, packages/three-flatland/src/ecs/systems/bufferSyncSystem.ts, packages/three-flatland/src/ecs/systems/conditionalTransformSyncSystem.ts, packages/three-flatland/src/ecs/systems/effectTraitsSystem.ts, packages/three-flatland/src/ecs/systems/flushDirtyRangesSystem.ts, packages/three-flatland/src/ecs/systems/index.ts, packages/three-flatland/src/ecs/systems/lateAssignSystem.ts, packages/three-flatland/src/ecs/systems/lightEffectSystem.ts, packages/three-flatland/src/ecs/systems/lightMaterialAssignSystem.ts, packages/three-flatland/src/ecs/systems/lightSyncSystem.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.ts, packages/three-flatland/src/ecs/systems/sceneGraphSyncSystem.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/lights/ForwardPlusLighting.test.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/Light2D.test.ts, packages/three-flatland/src/lights/LightEffect.test.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/lights/LightStore.test.ts, packages/three-flatland/src/lights/LightStore.ts, packages/three-flatland/src/lights/LightingStrategy.ts, packages/three-flatland/src/lights/LightingSystem.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/lights/wrapWithLightFlags.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/MaterialEffect.test.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts, packages/three-flatland/src/materials/channels.test.ts, packages/three-flatland/src/materials/channels.ts, packages/three-flatland/src/materials/index.ts, packages/three-flatland/src/pipeline/PassEffect.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/react/attach.test.ts, packages/three-flatland/src/react/attach.ts, packages/three-flatland/src/react/types.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/sprites/index.ts, packages/three-flatland/src/sprites/types.ts, planning/effect-channels/rfc-effect-channel-dependencies.md, pnpm-lock.yaml, scripts/sync-react-subpaths.ts
Stats: 69 files changed, 5669 insertions(+), 3813 deletions(-)

### e25fc4ce2d6e35787feb02d04c8b6cbb0e0a98b9
feat: add LightEffect system with traits, registry, and attach helpers for React integration
Files: packages/nodes/src/lighting/lights.ts, packages/nodes/src/lighting/lit.ts, packages/nodes/src/lighting/normalFromHeight.ts, packages/nodes/src/lighting/normalFromSprite.ts, packages/nodes/src/lighting/shadows.ts, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/lights/LightingSystem.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/lights/coordUtils.ts, packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/react/attach.ts, packages/three-flatland/src/react/index.ts, packages/three-flatland/src/react/types.ts
Stats: 17 files changed, 802 insertions(+), 175 deletions(-)

### 0faf84917675275c08ebc3d5cccb4896e11eb65b
feat: 2D lighting system (SDF + Forward+ + Radiance Cascades)
Adds comprehensive 2D lighting pipeline:
- JFA-based SDF generation for shadow occlusion
- Forward+ tiled light culling with SDF occlusion
- Radiance Cascades GI (WIP - not fully functional)
- Lighting strategy pattern (Simple/Direct/Radiance)
- Light2D class with point, directional, ambient, spot types
- TSL lighting shader nodes (lit, shadows, normals)
- Lighting examples (React + Vanilla)
- Planning docs for lighting architecture

Lighting is WIP - algorithms need validation and integration
with Flatland's ECS pipeline is not yet wired up.

Closes #16
Files: docs/src/content/docs/examples/lighting.mdx, docs/src/content/docs/guides/lighting.mdx, microfrontends.json, packages/nodes/package.json, packages/nodes/src/index.ts, packages/nodes/src/lighting/index.ts, packages/nodes/src/lighting/lights.ts, packages/nodes/src/lighting/lit.ts, packages/nodes/src/lighting/normalFromHeight.ts, packages/nodes/src/lighting/normalFromSprite.ts, packages/nodes/src/lighting/shadows.ts, packages/three-flatland/package.json, packages/three-flatland/src/index.ts, packages/three-flatland/src/lights/ForwardPlusLighting.ts, packages/three-flatland/src/lights/Light2D.ts, packages/three-flatland/src/lights/LightingStrategy.ts, packages/three-flatland/src/lights/LightingSystem.ts, packages/three-flatland/src/lights/RadianceCascades.ts, packages/three-flatland/src/lights/SDFGenerator.ts, packages/three-flatland/src/lights/coordUtils.ts, packages/three-flatland/src/lights/index.ts, packages/three-flatland/src/react/lights/index.ts, planning/experiments/Hybrid-SDF-Shadow-System.md, planning/experiments/Radiance-Accumulation.md, planning/experiments/SDF-Tiled-Forward-Plus.md, planning/experiments/Unified-2D-Lighting-Architecture.md
Stats: 26 files changed, 5600 insertions(+), 28 deletions(-)
