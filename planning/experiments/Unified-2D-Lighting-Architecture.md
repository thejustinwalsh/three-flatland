# Unified 2D Lighting Architecture for three-flatland

**Date**: February 2025  
**Status**: Research Complete, Ready for Implementation Planning

---

## Design Constraints (From User)

1. **Sprite SDFs**: Support baked, fallback with dev warning if not present
2. **Light Count**: 64 lights or less (WebGL compatibility focus)
3. **GI**: Full Radiance Cascades first, then "fake GI" for comparison (current fake GI is broken)
4. **Performance**: 1080p @ 60fps desktop, graceful mobile with hybrid approach
5. **Shadow Casters**: Fully dynamic (SDF regenerated each frame)

---

## CRITICAL: Why Current "Fake GI" Doesn't Work

### Current Implementation (SDFGenerator.ts + RadianceBuffer.ts)

The current approach attempts to:

1. Render lights as soft circles (`RadianceBuffer`)
2. Propagate light via JFA passes (`SDFGenerator._jfaColorNode`)
3. Sample propagated light with SDF-weighted mip levels

### Why It Produces Poor Results

**Problem 1: JFA is for Distance, Not Radiance**

JFA finds the **nearest seed** - it propagates a single value (nearest UV) across the texture.
Light propagation needs to **accumulate radiance from multiple directions** while respecting visibility.

```typescript
// Current broken logic (SDFGenerator line 361-387):
// - Accumulates light from 9 neighbors
// - Uses SDF distance as a "reach" limiter
// - But has NO directional information - doesn't know WHERE light came from
// - Light "bleeds" in all directions equally, ignoring walls
accumLight.addAssign(neighborLight.mul(weight))
```

**Problem 2: No Angular Resolution**

Radiance Cascades works because each probe stores radiance **per direction** (e.g., 16 directions at cascade 0).
The current approach stores a single scalar per pixel - no directional awareness.

**Problem 3: No Cascade Hierarchy**

RC exploits the penumbra hypothesis: near objects need many probes with few rays, far needs few probes with many rays.
Current approach has uniform sampling everywhere - inefficient and incorrect.

**Problem 4: Mipmaps ≠ GI**

Using mipmaps for "blur levels" doesn't create GI - it just makes a fuzzy blob.
Real GI needs **visibility-aware propagation** - light shouldn't bleed through walls.

### What Radiance Cascades Actually Does (Yaazarai GLSL)

```glsl
// 1. Each probe stores radiance for MULTIPLE DIRECTIONS
float angular = pow(2.0, cascadeIndex);  // 1, 2, 4, 8... rays per axis
float theta = (index + 0.5) * TAU / (angular * 4.0);  // Direction for this ray

// 2. Rays are SPHERE-TRACED through SDF within BOUNDED INTERVALS
vec4 raymarch(vec2 point, float theta, probe_info info) {
  for(float i = 0.0; i < info.range; i++) {
    df = texture(sdfTexture, ray).r;  // SDF distance
    if (df <= EPS) return texture(sceneRadiance, ray);  // HIT - return radiance
    ray += (delta * df);  // Sphere trace step
  }
  return vec4(0, 0, 0, 1);  // MISS - return visibility term for merge
}

// 3. Cascades MERGE hierarchically (far cascades fill gaps in near)
vec4 merge(vec4 rinfo, float index, probe_info pinfo) {
  if (rinfo.a == 0.0) return vec4(rinfo.rgb, 1.0);  // Hit - use this radiance
  // Miss - sample from higher cascade with bilinear interpolation
  vec4 interpolated = texture(cascadeN1, probeUVN1);
  return rinfo + interpolated;
}
```

---

## Executive Summary

This document outlines three lighting approaches for three-flatland, designed as **composable TSL nodes** that can be mixed and matched. All systems share a common SDF foundation and are optimized for **2D-only rendering** with **WebGL fallback compatibility**.

| System                | Use Case                  | Lights  | GI  | Soft Shadows   | WebGL        | Cost           |
| --------------------- | ------------------------- | ------- | --- | -------------- | ------------ | -------------- |
| **Forward+**          | Many dynamic lights       | 64-256+ | No  | Via SDF        | Yes (slower) | Per-tile loop  |
| **Radiance Cascades** | Full GI, emergent shadows | 1-32    | Yes | Yes (emergent) | Yes          | Fixed cascades |
| **Hybrid Radiance+**  | Best of both              | 32-64   | Yes | Yes            | Yes          | Combined       |

---

## Part 1: Foundation — The SDF Pipeline

All lighting systems depend on a **global Signed Distance Field (SDF)** generated via Jump Flood Algorithm. This is already partially planned in `Hybrid-SDF-Shadow-System.md`.

### 1.1 JFA SDF Generator (Fragment Shader — WebGL Compatible)

**Why fragment shaders**: WebGL has no compute shaders. JFA is inherently parallelizable across pixels and works efficiently as fullscreen quad passes.

```
Pass Flow (O(log2 N)) for NxN texture):
1. Seed Pass: occluders → RG = fragUV where alpha > 0, else (9999, 9999)
2. JFA Passes: For step = N/2 down to 1 (halving):
   - 9-neighbor propagation: keep nearest seed UV
3. Distance Pass: R = length(fragUV - seedUV), GB = vector to nearest
```

**Output Texture (RGB32F)**:

- R = distance to nearest occluder (normalized 0-1 UV space)
- G = vector.x to nearest occluder
- B = vector.y to nearest occluder

**Performance**: ~10-12 passes for 512px, each pass is a single fullscreen quad. Sub-millisecond on any GPU.

### 1.2 Sprite SDF Integration

For dynamic sprite shadow casters, we need to composite their silhouettes into the occlusion buffer:

**Option A — Binary Silhouettes (Simple)**:

- Render sprite alpha > 0.5 as white on black
- JFA processes this binary mask
- Works for any sprite, no preprocessing

**Option B — Baked Sprite SDFs (Quality)**:

- Pre-compute per-sprite SDF textures (offline)
- Composite into global SDF using `min(globalSDF, spriteSDF + spriteOffset)`
- Smoother shadows, better for large sprites

**Recommendation**: Start with Option A, add Option B as optimization for important shadow casters.

### 1.3 Sprite Normal Maps

For N·L diffuse lighting:

**Option A — Auto-generated (Runtime)**:

- Already implemented in `LightingSystem.createColorTransform()`
- Sobel filter on sprite alpha: `normal = normalize(vec3(-dFdx(alpha), -dFdy(alpha), 1))`
- Free, works for any sprite

**Option B — Baked Normal Maps (Quality)**:

- Artist-authored or tool-generated normal maps
- Pass as second texture channel
- Better quality for detailed sprites

---

## Part 2: Forward+ Tiled Lighting

### 2.1 Algorithm Overview (2D Adaptation)

Forward+ in 2D is simpler than 3D — no depth buffer needed for tile frustums, just 2D AABB tests.

```
Phase 1: Light Culling (per-frame, before rendering)
  For each tile (32×32 pixels):
    For each light:
      if circle(light.pos, light.radius) intersects tile AABB:
        if SDF at tile center < distance to light (wall between):
          skip (SDF occlusion cull)
        else:
          add light index to tile's list

Phase 2: Fragment Shading
  For each fragment:
    tileIndex = floor(fragUV * screenSize / tileSize)
    for lightIndex in tileList[tileIndex]:
      accumulate light contribution
```

### 2.2 WebGPU Path (Compute Shader)

```typescript
// TiledLightCuller.ts — Compute shader for tile assignment
const TILE_SIZE = 32
const MAX_LIGHTS_PER_TILE = 16

// Storage: Int32Array, 2 ivec4 blocks per tile (16 light indices)
const tileBuffer = attributeArray(tileData, 'ivec4')

// Compute: one invocation per tile
const cullLights = Fn(() => {
  const tileXY = instanceIndex.mod(tileCountX).toVar()
  const tileY = instanceIndex.div(tileCountX).toVar()
  const tileCenterUV = vec2(tileXY, tileY).add(0.5).mul(tileSize).div(screenSize)

  const lightIdx = int(0).toVar()

  Loop({ end: lightCount }, ({ i }) => {
    const lightPos = textureLoad(lightsTexture, ivec2(i, 0)).rg
    const lightRadius = textureLoad(lightsTexture, ivec2(i, 1)).b

    // Circle-AABB intersection
    const lightUV = lightPos.sub(occOffset).div(occSize)
    const radiusUV = lightRadius.div(occSize.x)
    const dist = lightUV.sub(tileCenterUV).length()
    const intersects = dist.lessThan(radiusUV.add(tileSizeUV))

    // SDF occlusion cull
    const sdfDist = textureLoad(sdfTexture, tileCenterPixel).r
    const occluded = sdfDist.lessThan(dist)

    If(intersects.and(occluded.not()), () => {
      // Store 1-based index (0 = empty)
      tileBuffer.element(tileIndex * 2 + lightIdx / 4).setComponent(lightIdx % 4, i + 1)
      lightIdx.addAssign(1)
    })
  })
}).compute(tileCount)
```

### 2.3 WebGL Fallback (No Compute)

Two approaches:

**A. Fragment Shader "Fake Compute" (Per-Frame RT)**:

```typescript
// Render to DataTexture using fragment shader
// Each pixel = one tile, RGBA = 4 light indices
// Multiple textures for > 4 lights per tile
const tileCullPass = new MeshBasicNodeMaterial({
  colorNode: Fn(() => {
    const tileXY = fragCoord.floor()
    // ... same culling logic, output to gl_FragColor
  }),
})
```

**B. CPU Culling (Simple, Slower)**:

```typescript
// JavaScript tile assignment
for (const tile of tiles) {
  tile.lights = []
  for (const light of lights) {
    if (circleIntersectsAABB(light, tile) && !sdfOccludes(light, tile)) {
      tile.lights.push(light.index)
    }
  }
}
// Upload to DataTexture
```

**Recommendation**: Use CPU culling for WebGL with < 64 lights. Fragment shader culling for 64-256 lights.

### 2.4 Fragment Shader (Already Implemented)

`LightingSystem.createTiledColorTransform()` already handles the fragment-side tile lookup:

```typescript
// Determine tile from fragment position
const tileXY = fragUV.mul(screenSize).div(tileSize).floor()
const tileIndex = tileXY.y.mul(tileCountX).add(tileXY.x)

// Loop over lights in this tile
Loop(MAX_LIGHTS_PER_TILE, ({ i }) => {
  const lightIndex = tileLookup(tileIndex, i)
  If(lightIndex.greaterThan(0), () => {
    // Process light...
  })
})
```

### 2.5 SDF Sphere-Traced Shadows

For each light contribution, trace through SDF:

```typescript
// Already in LightingSystem._buildLightContribution()
for (let step = 0; step < 16; step++) {
  const sdfDist = sampleTexture(sdfTex, sampleUV).r

  // Hit occluder
  if (sdfDist < 0.001) {
    shadow = 0
    break
  }

  // Quilez soft shadow
  shadow = min(shadow, (k * sdfDist) / t)

  // Sphere trace (adaptive step)
  t += max(sdfDist, 0.001)
  if (t > rayLength) break
}
```

---

## Part 3: Radiance Cascades (Proper Implementation)

### 3.1 Core Algorithm (2D)

Radiance Cascades exploits the **Penumbra Hypothesis**:

- Near light sources: need high **spatial resolution** (many probes), low **angular resolution** (few rays)
- Far from light sources: need high **angular resolution** (many rays), low **spatial resolution** (few probes)

```
Cascade Hierarchy (Direction-First Layout):
┌─────────────────────────────────────────────────────────────────────────┐
│ Cascade 0: 4 rays (2×2), probe spacing = 4px,  interval 0-4 px         │
│ Cascade 1: 16 rays (4×4), probe spacing = 8px,  interval 4-20 px       │
│ Cascade 2: 64 rays (8×8), probe spacing = 16px, interval 20-84 px      │
│ Cascade 3: 256 rays (16×16), probe spacing = 32px, interval 84-340 px  │
└─────────────────────────────────────────────────────────────────────────┘

Key Insight: Each cascade 4× the angular resolution, 2× the spacing, 4× the interval length
Merging: Cascade N reads from Cascade N+1 to fill gaps beyond its interval
```

### 3.2 Direction-First Probe Layout (Critical for Performance)

The Yaazarai optimization uses **direction-first** layout instead of position-first:

```
Position-First (naive):          Direction-First (optimized):
┌─────────────────────┐          ┌─────────────────────┐
│ P0D0 P0D1 P0D2 P0D3 │          │ P0D0 P1D0 P2D0 P3D0 │  <- All probes, dir 0
│ P1D0 P1D1 P1D2 P1D3 │          │ P0D1 P1D1 P2D1 P3D1 │  <- All probes, dir 1
│ P2D0 P2D1 P2D2 P2D3 │          │ P0D2 P1D2 P2D2 P3D2 │  <- All probes, dir 2
│ P3D0 P3D1 P3D2 P3D3 │          │ P0D3 P1D3 P2D3 P3D3 │  <- All probes, dir 3
└─────────────────────┘          └─────────────────────┘

Why direction-first: Hardware bilinear interpolation samples 4 adjacent texels.
With direction-first, those 4 texels are the SAME DIRECTION from 4 neighboring probes.
This makes cascade merging a single bilinear sample instead of 4 point samples + manual blend.
```

### 3.3 TSL Implementation

```typescript
// packages/core/src/lights/RadianceCascades.ts

interface CascadeConfig {
  baseRayCount: number // 4 (2×2) - starting angular resolution
  cascadeCount: number // 4-5 for 1080p
  baseInterval: number // 4px - shortest ray interval
  cascadeTextureSize: number // 512 or 1024 - probe grid resolution
}

// Compute probe info for direction-first layout
const cascadeProbeInfo = Fn(([coord, cascadeIndex, config]) => {
  const angular = pow(float(2), cascadeIndex) // 1, 2, 4, 8...
  const angularSq = angular.mul(angular) // 1, 4, 16, 64 rays
  const linear = config.baseInterval.mul(pow(float(2), cascadeIndex))
  const probeGroupSize = config.cascadeTextureSize.div(angular) // Size of one probe group

  // Direction-first: texel → which probe and which direction
  const rayXY = coord.div(probeGroupSize).floor() // Which ray (direction index)
  const probeXY = coord.mod(probeGroupSize) // Which probe within group
  const rayIndex = rayXY.x.add(rayXY.y.mul(angular))

  // Interval bounds (geometric sum for offset)
  const intervalOffset = config.baseInterval.mul(
    float(1)
      .sub(pow(float(4), cascadeIndex))
      .div(float(1).sub(float(4)))
  )
  const intervalRange = config.baseInterval.mul(pow(float(4), cascadeIndex))

  return { angular, angularSq, linear, probeXY, rayIndex, intervalOffset, intervalRange }
})

// Single-pass: Cast rays within interval AND merge with cascade N+1
const radianceCascadePass = Fn(
  ([cascadeIndex, sdfTexture, sceneRadiance, prevCascadeTexture, config]) => {
    const coord = fragCoord.xy.floor()
    const info = cascadeProbeInfo(coord, cascadeIndex, config)

    // Probe world position
    const probeWorldPos = info.probeXY.add(float(0.5)).mul(info.linear)

    // Ray direction from index
    const theta = info.rayIndex.add(float(0.5)).mul(TAU).div(info.angularSq)
    const rayDir = vec2(cos(theta), sin(theta).negate()) // Y-flip for screen coords

    // === RAYMARCH WITHIN INTERVAL ===
    const hitRadiance = vec3(0).toVar()
    const visibility = float(1).toVar()
    const t = info.intervalOffset.toVar()
    const scale = sdfTextureScale // SDF UV → world scale

    Loop(32, () => {
      const sampleWorld = probeWorldPos.add(rayDir.mul(t))
      const sampleUV = sampleWorld.div(worldSize)

      // Bounds check
      If(
        sampleUV.x
          .lessThan(0)
          .or(sampleUV.x.greaterThan(1))
          .or(sampleUV.y.lessThan(0))
          .or(sampleUV.y.greaterThan(1)),
        () => {
          Break()
        }
      )

      // SDF sphere trace
      const sdfDist = sampleTexture(sdfTexture, sampleUV).r.mul(scale)

      If(sdfDist.lessThan(float(0.001)), () => {
        // HIT - sample scene radiance, apply sRGB
        const sceneSample = sampleTexture(sceneRadiance, sampleUV)
        hitRadiance.assign(pow(sceneSample.rgb, vec3(2.2)))
        visibility.assign(float(0)) // Block further merge
        Break()
      })

      t.addAssign(sdfDist.max(float(0.001)))
      If(t.greaterThan(info.intervalOffset.add(info.intervalRange)), () => {
        Break()
      })
    })

    // === MERGE WITH HIGHER CASCADE (if missed) ===
    const merged = vec3(hitRadiance).toVar()

    If(
      visibility.greaterThan(float(0.5)).and(cascadeIndex.lessThan(config.cascadeCount.sub(1))),
      () => {
        // Direction-first layout: bilinear sample gives us interpolated radiance from 4 neighboring probes
        const angularN1 = pow(float(2), cascadeIndex.add(1))
        const probeGroupSizeN1 = config.cascadeTextureSize.div(angularN1)

        // The correlated ray in cascade N+1 (same direction range, but more subdivided)
        const rayN1 = info.rayIndex // Same base direction (4 rays in N → 1 of 16 rays in N+1)
        const rayXYN1 = vec2(rayN1.mod(angularN1), rayN1.div(angularN1).floor())

        // Interpolated probe position (probe falls into center of 2×2 block in N+1)
        const probeN1 = info.probeXY.mul(float(0.5)).add(float(0.25))
        const clampedProbeN1 = max(vec2(1), min(probeN1, probeGroupSizeN1.sub(1)))

        // Final lookup UV
        const lookupUV = rayXYN1
          .mul(probeGroupSizeN1)
          .add(clampedProbeN1)
          .div(config.cascadeTextureSize)
        const mergedSample = sampleTexture(prevCascadeTexture, lookupUV)

        merged.addAssign(mergedSample.rgb)
      }
    )

    // Apply sRGB only at cascade 0
    const output = cascadeIndex.equal(0).select(pow(merged, vec3(1.0 / 2.2)), merged)

    return vec4(output, float(1).sub(visibility))
  }
)
```

### 3.4 Pass Structure (Single-Pass Per Cascade)

```
Frame Pipeline:
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Render occluders to binary mask (existing occlusion RT)             │
│ 2. Generate SDF via JFA (existing SDFGenerator, ~10 passes)            │
│ 3. Render lights as circles to "scene radiance" texture                │
│                                                                        │
│ 4. For cascade = N-1 down to 0:  ← Start from HIGHEST cascade          │
│    └─ radianceCascadePass(cascadeIndex, sdf, sceneRadiance, prevCascade)│
│       Output: cascadeTexture[cascadeIndex]                             │
│       (Each pass reads from cascade+1, writes to cascade)              │
│                                                                        │
│ 5. Final GI = cascadeTexture[0] (samples at any world position)        │
└─────────────────────────────────────────────────────────────────────────┘

Pass Count: SDF (~10) + Cascades (4-5) = ~15 passes total
All fragment shader — WebGL compatible!
```

### 3.5 WebGL vs WebGPU Performance

| Platform       | Cascade Count | Resolution | Expected Time |
| -------------- | ------------- | ---------- | ------------- |
| WebGPU Desktop | 5             | 512×512    | ~2-3ms        |
| WebGL Desktop  | 4             | 512×512    | ~4-6ms        |
| WebGPU Mobile  | 3             | 256×256    | ~4-5ms        |
| WebGL Mobile   | 2             | 256×256    | ~6-8ms        |

### 3.6 Pre-Averaging Optimization (Yaazarai)

Cast 4 rays, average, store 1 result. Reduces output size 4× per cascade:

```typescript
// Instead of storing 4 individual ray results:
// Cast 4 adjacent rays, average their radiance
const preAvgRadiance = vec3(0).toVar()
Loop(4, ({ i }) => {
  const subIndex = info.rayIndex.mul(4).add(i)
  const subTheta = subIndex.add(float(0.5)).mul(TAU).div(info.angularSq.mul(4))
  // ... raymarch for this sub-direction
  preAvgRadiance.addAssign(rayResult.mul(0.25))
})
```

### 3.7 Known Artifacts and Fixes

**Ringing (halo at cascade boundaries):**

- Cause: Discrete intervals create visible seams
- Fix: Overlap intervals by ~10% between cascades

**Aliasing (pixelated shadows at distance):**

- Cause: Low angular resolution at high cascades
- Fix: Increase base ray count (4 → 16), or accept for stylized look

**sRGB Banding:**

- Cause: Linear interpolation in sRGB space
- Fix: Convert to linear space before accumulation, back to sRGB at cascade 0 only

---

## Part 4: Hybrid Radiance+ System

### 4.1 Concept

Combine Forward+ and Radiance Cascades for the best of both:

| Component       | Forward+               | Radiance Cascades      |
| --------------- | ---------------------- | ---------------------- |
| Direct lighting | Yes (sharp, immediate) | No (indirect only)     |
| Indirect GI     | No                     | Yes (light bounce)     |
| Hard shadows    | Yes (SDF trace)        | No                     |
| Soft shadows    | Yes (Quilez)           | Yes (emergent from GI) |
| Performance     | O(lights per tile)     | O(cascades)            |

### 4.2 Architecture

```
Frame Pipeline:
  1. SDF Generation (JFA) — shared foundation
  2. Forward+ Light Culling — tile assignment
  3. Radiance Cascade Update — GI propagation
  4. Fragment Shading:
     a. Direct lighting (Forward+ tiled loop)
     b. + Indirect GI (Radiance Cascade sample)
     c. + SDF shadows (sphere trace per light)
```

### 4.3 TSL Node Composition

```typescript
// Composable lighting nodes

const directLighting = createTiledColorTransform(tileLookup, ...)
const indirectGI = createRadianceColorTransform()
const sdfShadows = createSdfShadowNode(sdfTexture, ...)

// Combine in material
sprite.material.colorTransform = (ctx) => {
  const direct = directLighting(ctx)
  const indirect = indirectGI(ctx)
  const shadow = sdfShadows(ctx)

  return vec4(
    direct.rgb.mul(shadow).add(indirect.rgb.mul(0.3)),
    ctx.color.a
  )
}
```

### 4.4 Retro Effects Integration

Both systems support the existing retro controls:

```typescript
// Banding — quantize final light to N levels
const useBands = bands.greaterThan(0)
const quantized = totalLight.mul(bands).round().div(bands)
const finalLight = useBands.select(quantized, totalLight)

// Dithering — Bayer matrix on shadow factor
const bayerPattern = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]
const ditherThreshold = bayer[fragCoord.x % 4][fragCoord.y % 4] / 16.0
const ditheredShadow = shadow.greaterThan(ditherThreshold).select(1, 0)

// Pixel snapping — already implemented
const snappedPos = worldPos.div(pixelSize).floor().mul(pixelSize)
```

---

## Part 5: Implementation Roadmap

### Phase 1: SDF Foundation (Done - Needs Verification)

**Status**: SDFGenerator.ts exists, but light propagation logic is broken.

**Tasks**:

1. Keep JFA SDF generation (working)
2. Remove broken light propagation code from SDFGenerator
3. SDFGenerator outputs ONLY SDF (R=dist, GB=vector)
4. Verify sphere-traced shadows still work

**Deliverable**: Clean SDF pipeline without fake GI code

### Phase 2: Proper Radiance Cascades (Week 1-2)

**Files to create**:

- `packages/core/src/lights/RadianceCascades.ts`

**Implementation**:

```typescript
export class RadianceCascades {
  private _cascadeRTs: WebGLRenderTarget[] // One per cascade level
  private _cascadeMaterials: MeshBasicNodeMaterial[]
  private _config: CascadeConfig

  constructor(config?: Partial<CascadeConfig>)

  init(width: number, height: number): void
  resize(width: number, height: number): void

  // Call each frame: generates all cascades from highest to lowest
  generate(renderer: WebGPURenderer, sdfTexture: Texture, sceneRadianceTexture: Texture): void

  // Final GI texture for sampling
  get radianceTexture(): Texture

  dispose(): void
}
```

**Tasks**:

1. Cascade texture management (direction-first layout)
2. Single-pass raymarch + merge shader (per cascade)
3. Scene radiance rendering (lights as circles, existing RadianceBuffer)
4. sRGB handling (linear accumulation, sRGB output)
5. Test with knightmark example

**Deliverable**: Working GI with proper light propagation and emergent shadows

### Phase 3: Mobile-Optimized "Lite GI" (Week 2-3)

For mobile, we need a simpler approach. Options:

**Option A: Reduced Radiance Cascades**

- 2 cascades instead of 4-5
- 256×256 instead of 512×512
- Fewer rays (2×2 base instead of 4×4)
- ~6ms budget

**Option B: SDF Flood Fill (Simpler Algorithm)**

```
Instead of directional rays, flood-fill light through SDF:
1. Render lights to texture
2. Iterative blur passes with SDF masking
3. Each pass: sample neighbors, weight by SDF distance
4. Light spreads through open areas, blocked by walls

Pros: Simpler, fewer passes (~4-6)
Cons: No true angular resolution, softer shadows
```

**Option C: Temporal Radiance Cascades**

- Full 4-cascade setup, but update 1 cascade per frame
- Complete GI refresh every 4 frames
- Good for mostly-static lighting

**Recommendation**: Start with Option A (reduced RC), measure, then try Option B if needed.

### Phase 4: Forward+ Direct Lighting (Week 3)

**Rationale**: With ≤64 lights and working RC, Forward+ becomes optional optimization.
However, for hard/stylized shadows (non-GI look), Forward+ is still valuable.

**Tasks**:

1. CPU-based tile culling (simpler for WebGL)
2. SDF occlusion culling in tile assignment
3. Tiled fragment shader loop
4. Integration with existing `createTiledColorTransform()`

**Deliverable**: Optional Forward+ for hard shadow look or performance boost

### Phase 5: Hybrid and Polish (Week 4)

**Tasks**:

1. Compose RC (indirect) + Forward+ (direct) for stylized looks
2. Banding effect on shadows (existing bands uniform)
3. Bayer matrix dithering on shadows (new)
4. Performance profiling across platforms
5. Documentation and examples

**Deliverable**: Production-ready system with multiple quality presets

---

## Quality Presets (API Design)

```typescript
const flatland = new Flatland({
  lighting: 'rc-full'      // Full Radiance Cascades (desktop)
  // or
  lighting: 'rc-lite'      // Reduced cascades (mobile)
  // or
  lighting: 'forward-plus' // Direct lighting only, hard shadows
  // or
  lighting: 'hybrid'       // Forward+ direct + RC indirect
  // or
  lighting: 'simple'       // Just attenuation, no shadows/GI
})

// Runtime quality adjustment
flatland.lightingQuality = 'rc-lite'  // Switch on-the-fly
```

---

## Part 6: Performance Budget

### Target: 1080p @ 60fps (16.6ms frame budget)

Allocate ~8ms for lighting pipeline (leaving headroom for sprites, game logic):

| Component             | WebGPU Desktop | WebGL Desktop | Mobile      |
| --------------------- | -------------- | ------------- | ----------- |
| SDF Generation (JFA)  | ~0.5ms         | ~1ms          | ~2ms        |
| Radiance Cascades (4) | ~2-3ms         | ~4-6ms        | N/A         |
| Radiance Cascades (2) | ~1-1.5ms       | ~2-3ms        | ~4-6ms      |
| Forward+ Culling      | ~0.2ms         | ~1ms (CPU)    | ~2ms (CPU)  |
| Fragment Shading      | ~1-2ms         | ~2-3ms        | ~3-4ms      |
| **Total (Full RC)**   | **~4-6ms**     | **~8-11ms**   | **N/A**     |
| **Total (Lite RC)**   | **~3-4ms**     | **~5-7ms**    | **~8-12ms** |

### Mobile Strategy

Mobile gets "Lite" preset by default:

- 2 cascades instead of 4
- 256×256 cascade resolution instead of 512×512
- Optional: Temporal distribution (1 cascade per frame)

### Quality Auto-Detection

```typescript
// Detect platform and set appropriate quality
function detectLightingQuality(): LightingQuality {
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
  const hasWebGPU = 'gpu' in navigator

  if (isMobile) return 'rc-lite'
  if (hasWebGPU) return 'rc-full'
  return 'rc-lite' // WebGL desktop - play safe
}
```

---

## Summary: What Changes

### Remove (Broken)

- `SDFGenerator._jfaColorNode` light propagation logic
- `SDFGenerator._renderLightOutput`
- `SDFGenerator._lightRT`

### Keep (Working)

- `SDFGenerator` JFA SDF generation
- `RadianceBuffer` light circle rendering
- `LightingSystem` DataTexture storage
- `createTiledColorTransform` Forward+ fragment shader

### Add (New)

- `RadianceCascades` class with proper cascade hierarchy
- Direction-first probe layout
- Single-pass raymarch + merge per cascade
- Quality presets API

---

## References

### Radiance Cascades

- [Jason McGhee's Interactive Tutorial](https://jason.today/rc) — Best 2D explanation
- [Original Paper (arXiv:2408.14425)](https://arxiv.org/abs/2408.14425)
- [Yaazarai's GM Shaders Tutorial](https://mini.gmshaders.com/p/radiance-cascades)
- [SimonDev YouTube](https://www.youtube.com/watch?v=3so7xdZHKxw)

### Forward+

- [Forward+: Bringing Deferred Rendering to the Next Level](https://takahiroharada.files.wordpress.com/2015/04/forward_plus.pdf)
- [bcrusco/Forward-Plus-Renderer](https://github.com/bcrusco/Forward-Plus-Renderer)
- [3D Game Engine Programming: Forward vs Deferred vs Forward+](https://www.3dgep.com/forward-plus/)
- [Wicked Engine: Optimizing tile-based light culling](https://wickedengine.net/2018/01/optimizing-tile-based-light-culling/)

### TSL / Three.js

- [Three.js TiledLightsNode](https://github.com/mrdoob/three.js/blob/master/examples/jsm/tsl/lighting/TiledLightsNode.js)
- Three.js TSL examples in `/examples/jsm/tsl/`

### Previous three-flatland Experiments

- `planning/experiments/Hybrid-SDF-Shadow-System.md`
- `planning/experiments/SDF-Tiled-Forward-Plus.md`
- `planning/experiments/Radiance-Accumulation.md`
