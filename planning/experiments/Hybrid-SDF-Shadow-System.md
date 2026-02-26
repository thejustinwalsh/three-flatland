Hybrid SDF Shadow System — Consolidated Plan

 Merges the immediate SDF shadow algorithm with the SDF-Tiled Forward+ architecture into a phased plan. Phase 1 (this PR) fixes shadows. Later phases unlock unlimited lights and
 indirect GI.

 ---
 Plan Comparison
 ┌──────────────────┬────────────────────────────┬─────────────────────────────┬────────────────────────────────────────────────┐
 │      Aspect      │ Current Plan (shadow-only) │     SDF-Tiled Forward+      │               Merged (this plan)               │
 ├──────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────┤
 │ SDF generation   │ JFA, fragment shader       │ JFA, compute or fragment    │ JFA, fragment shader (works on all targets)    │
 ├──────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────┤
 │ Shadow technique │ Sphere trace, Quilez soft  │ SDF cone trace (same)       │ Sphere trace + Quilez                          │
 ├──────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────┤
 │ Light storage    │ Uniform arrays (8 max)     │ StorageBuffer / DataTexture │ Phase 1: uniform arrays. Phase 2: DataTexture  │
 ├──────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────┤
 │ Light culling    │ Per-fragment loop over all │ Adaptive Forward+ tiling    │ Phase 1: simple loop. Phase 3: tiling          │
 ├──────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────┤
 │ Self-shadow      │ Ray start bias             │ N/A (inherent in SDF)       │ Ray start bias                                 │
 ├──────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────┤
 │ Indirect GI      │ Not included               │ Mipmapped radiosity         │ Phase 3: mipmap GI                             │
 ├──────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────┤
 │ SDF output       │ R = distance               │ RGBA: dist + vector         │ RGB: dist + vector (enables future GI/normals) │
 ├──────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────┤
 │ Retro controls   │ Existing bands/pixelSize   │ Not specified               │ Shadow-specific banding + existing controls    │
 ├──────────────────┼────────────────────────────┼─────────────────────────────┼────────────────────────────────────────────────┤
 │ Targets          │ WebGPU only                │ WebGPU + WebGL strategy     │ All targets via fragment-only JFA              │
 └──────────────────┴────────────────────────────┴─────────────────────────────┴────────────────────────────────────────────────┘
 Key insight: Both plans share the same foundation (JFA SDF + sphere/cone traced shadows). The Forward+ plan adds light scaling and GI on top. We build the SDF foundation now, then
 layer on scaling features.

 ---
 Phase 1: SDF Shadow Algorithm (this PR)

 Step 1: Create SDFGenerator

 New file: packages/core/src/lights/SDFGenerator.ts

 JFA converts binary occlusion → SDF in O(log2(N)) fullscreen passes using only fragment shaders (no compute needed — works on WebGL and WebGPU).

 Render setup: Scene + PlaneGeometry(2,2) + OrthographicCamera(-1,1,1,-1) for fullscreen passes. (QuadMesh is not exported in Three.js r182.)

 Render targets (all HalfFloatType, NearestFilter):
 - _pingRT / _pongRT — ping-pong pair for JFA flood (RG = nearest seed UV)
 - _sdfRT — final output: R = distance, GB = vector to nearest occluder (enables future normal estimation and indirect GI from the Forward+ plan)

 Materials (all MeshBasicNodeMaterial with custom colorNode):
 - Seed material: Reads occlusion RT alpha → writes (fragUV.x, fragUV.y) where alpha > 0, else (9999, 9999)
 - JFA material A (reads ping → writes pong): 9-neighbor propagation — for each neighbor at offset * jumpSize, keep the seed UV that's closest to this fragment
 - JFA material B (reads pong → writes ping): Same shader, reversed source
 - Distance material A/B (reads ping/pong respectively): Computes length(fragUV - seedUV) and fragUV - seedUV vector

 Two JFA materials required because TSL texture() captures the Texture object reference at node creation. RT .texture is stable, so we point each material at a different RT.

 generate(renderer) flow:
 1. Seed pass: occlusion RT → pingRT
 2. For step = maxDim/2 down to 1 (halving each iteration):
    - Set jumpSize uniform
    - JFA pass: ping→pong or pong→ping (alternating)
 3. Distance pass: final JFA RT → sdfRT

 Pass count: 1 + ceil(log2(max(w,h))) + 1 ≈ 10 passes for 256px. Each pass is a single fullscreen quad draw — extremely cheap.

 Public API:
 class SDFGenerator {
   get sdfTexture(): Texture       // R=distance, GB=vector
   init(width: number, height: number): void
   resize(width: number, height: number): void
   generate(renderer: WebGPURenderer, occlusionRT: WebGLRenderTarget): void
   dispose(): void
 }

 Step 2: Modify LightingSystem — sphere-traced SDF shadows

 File: packages/core/src/lights/LightingSystem.ts

 New uniforms:
 - _sdfTexture: Texture | null — SDF from SDFGenerator
 - _shadowBiasNode: uniform(float) — ray start bias (~0.03-0.05 UV), skips past caster's own SDF region
 - Repurpose _shadowSoftnessNode as Quilez k parameter (higher = harder shadows)

 New public API:
 get shadowBias(): number
 set shadowBias(value: number)
 setSdfTexture(texture: Texture): void

 Replace shadow shader block (currently lines 503-536). Current code: 8-step fixed ray march with bounding-box self-shadow check.

 New: 16-step sphere trace sampling SDF:
 1. surfaceUV = (surfacePos - occOffset) / occSize
 2. lightUV = (lightPos - occOffset) / occSize
 3. rayDir = normalize(lightUV - surfaceUV)
 4. rayLength = length(lightUV - surfaceUV)
 5. t = shadowBias
 6. shadow = 1.0
 7. Loop 16 steps:
    - sampleUV = surfaceUV + rayDir * t (with Y-flip for WebGPU RT)
    - dist = sdfTexture.sample(sampleUV).r
    - if dist < 0.001: shadow = 0, break
    - shadow = min(shadow, k * dist / t)     ← Quilez soft shadow
    - t += max(dist, 0.001)                  ← sphere trace (adaptive step)
    - if t > rayLength: break
 8. finalContribution *= shadow

 What this removes:
 - MAX_SHADOW_CASTERS constant (no longer needed)
 - Bounding-box self-shadow encoding (R/G/B channels in occlusion)
 - Per-step occlusion + isSelf check

 Retro shadow integration — shadows interact naturally with existing banding because:
 - Shadow factor multiplies finalContribution BEFORE it's added to totalLight
 - totalLight is then quantized by bands uniform
 - So shadows are already quantized by the existing band system
 - The pixelSize snap also affects shadow sampling since surfacePos is snapped

 No additional shadow-specific banding needed — the existing bands and pixelSize controls already produce the retro effect on shadows.

 Smooth mode: Set bands = 0 (already supported, disables quantization). Shadows produce smooth penumbra via Quilez technique.

 Step 3: Modify Flatland — wire SDFGenerator, simplify occlusion

 File: packages/core/src/Flatland.ts

 Replace mesh pool with InstancedMesh (no caster limit, 1 draw call):
 - Remove: _shadowMeshPool, _shadowMaterials, _shadowGeometry arrays
 - Add: _shadowInstancedMesh: InstancedMesh
 - Add: _sdfGenerator: SDFGenerator
 - Material: plain MeshBasicMaterial({ color: 0xffffff }) — binary alpha only

 Simplify _initShadowPipeline():
 this._sdfGenerator = new SDFGenerator()
 this._sdfGenerator.init(rtWidth, rtHeight)

 const geo = new PlaneGeometry(1, 1)
 const mat = new MeshBasicMaterial({ color: 0xffffff })
 this._shadowInstancedMesh = new InstancedMesh(geo, mat, initialCapacity)
 this._occlusionScene.add(this._shadowInstancedMesh)

 Simplify _syncAndRenderOcclusion():
 - Remove scoring/sorting/culling (no limit)
 - Remove RGB self-shadow encoding
 - Iterate visible casters → setMatrixAt(i, matrix)
 - Render occlusion
 - Call this._sdfGenerator.generate(renderer, this._occlusionRT)
 - Call this.lighting.setSdfTexture(this._sdfGenerator.sdfTexture)

 Dynamic capacity: If caster count exceeds current InstancedMesh capacity, recreate with 2x capacity (same pattern as growing arrays).

 Update resize(): Call _sdfGenerator.resize().

 Update dispose(): Call _sdfGenerator.dispose(), dispose InstancedMesh.

 Remove import of MAX_SHADOW_CASTERS.

 Step 4: Update exports

 File: packages/core/src/lights/index.ts
 - Remove MAX_SHADOW_CASTERS export
 - Add SDFGenerator export

 Step 5: Update knightmark example

 File: examples/vanilla/knightmark/main.ts
 - Set shadowStrength to 0.7
 - Add shadowBias tuning (start 0.04)
 - Add SDF debug visualization to minimap (gradient distance field, not binary)
 - Verify retro look with bands=16, pixelSize=4
 - Test smooth mode with bands=0

 ---
 Phase 2+3: DataTexture, Tiled Forward+, and Mipmapped Radiance (this PR)

 The remaining phases combine into a single implementation that replaces uniform arrays with DataTexture storage, adds compute-shader tile assignment with SDF-based occlusion culling,
 and adds mipmapped radiance for indirect GI. All three systems share the SDF texture from Phase 1.

 Reference implementation: Three.js TiledLightsNode.js (examples/jsm/tsl/lighting/) — provides exact TSL patterns for DataTexture, attributeArray, compute shaders, and tile lookup.

 ---
 Step 1: DataTexture Light Storage

 File: packages/core/src/lights/LightingSystem.ts

 Replace uniform arrays with a single DataTexture. This removes the MAX_LIGHTS hard cap.

 DataTexture layout: Width = maxLights (default 256), Height = 4 rows, RGBAFormat, FloatType.
 ┌─────┬────────┬───────────┬──────────┬──────────┐
 │ Row │   R    │     G     │    B     │    A     │
 ├─────┼────────┼───────────┼──────────┼──────────┤
 │ 0   │ posX   │ posY      │ colorR   │ colorG   │
 ├─────┼────────┼───────────┼──────────┼──────────┤
 │ 1   │ colorB │ intensity │ radius   │ falloff  │
 ├─────┼────────┼───────────┼──────────┼──────────┤
 │ 2   │ dirX   │ dirY      │ angle    │ penumbra │
 ├─────┼────────┼───────────┼──────────┼──────────┤
 │ 3   │ type   │ enabled   │ reserved │ reserved │
 └─────┴────────┴───────────┴──────────┴──────────┘
 Backing data: Float32Array(maxLights * 4 * 4) — 4 rows × 4 channels × maxLights width.

 Read pattern (TSL, from TiledLightsNode):
 import { textureLoad } from 'three/tsl'

 const row0 = textureLoad(lightsTexture, ivec2(lightIndex, 0))
 const row1 = textureLoad(lightsTexture, ivec2(lightIndex, 1))
 const lightPos = vec2(row0.r, row0.g)
 const lightColor = vec3(row0.b, row0.a, row1.r)
 const lightIntensity = row1.g
 // ... etc

 Changes to LightingSystem:
 - Add _lightsData: Float32Array, _lightsTexture: DataTexture, _lightCount: number
 - Add _lightsTextureNode: TSLNode — stable reference for shader
 - Add maxLights constructor option (default 256, configurable)
 - Replace _positionArray, _colorArray, etc. with single DataTexture
 - sync(): Write light data into _lightsData rows, set _lightsTexture.needsUpdate = true
 - _countNode stays as a uniform (loop bound)
 - Keep existing uniform nodes for non-per-light data (bands, pixelSize, glow, shadow, etc.)
 - Remove MAX_LIGHTS constant export

 getLightData(index) helper (TSL Fn, used by both tiled and non-tiled paths):
 const getLightData = Fn(([index]: [TSLNode]) => {
   const i = int(index)
   const row0 = textureLoad(lightsTexture, ivec2(i, 0))
   const row1 = textureLoad(lightsTexture, ivec2(i, 1))
   const row2 = textureLoad(lightsTexture, ivec2(i, 2))
   const row3 = textureLoad(lightsTexture, ivec2(i, 3))
   // Return struct-like object
   return { row0, row1, row2, row3 }
 })

 Non-tiled path (backward compat): createColorTransform() still loops 0..count, but reads from DataTexture instead of uniform arrays. Same shader structure, just different data source.

 ---
 Step 2: Tiled Light Culler (Compute Shader)

 New file: packages/core/src/lights/TiledLightCuller.ts

 Compute shader that assigns lights to screen-space tiles. Uses SDF for occlusion culling.

 Tile storage: Fixed 32×32 tile grid. MAX_LIGHTS_PER_TILE = 16 (2 × ivec4 blocks per tile).

 const TILE_SIZE = 32
 const MAX_LIGHTS_PER_TILE = 16  // 2 ivec4 blocks

 class TiledLightCuller {
   private _tileData: Int32Array
   private _tileBuffer: TSLNode  // attributeArray(int32Array, 'ivec4')
   private _computeNode: TSLNode // Fn().compute(tileCount)
   private _tileCountX: number
   private _tileCountY: number

   init(screenWidth: number, screenHeight: number): void
   resize(screenWidth: number, screenHeight: number): void
   update(renderer: WebGPURenderer): void  // dispatches compute
   dispose(): void

   get tileBuffer(): TSLNode
   get tileCountX(): number
   get tileCountY(): number
 }

 attributeArray setup (from TiledLightsNode pattern):
 const tileCount = tileCountX * tileCountY
 const tileData = new Int32Array(tileCount * MAX_LIGHTS_PER_TILE)
 const tileBuffer = attributeArray(tileData, 'ivec4').setName('tileBuffer')

 Note: attributeArray in Three.js maps to a storage buffer that's shared between compute and fragment shaders.

 Compute shader logic (one invocation per tile):
 1. tileXY = ivec2(instanceIndex % tileCountX, instanceIndex / tileCountX)
 2. tileScreenMin = vec2(tileXY) * tileSize / screenSize
 3. tileScreenMax = tileScreenMin + tileSize / screenSize
 4. tileCenterUV = (tileScreenMin + tileScreenMax) * 0.5
 5. Initialize tile light slots to 0
 6. lightIdx = 0
 7. Loop over all lights (0..lightCount):
    a. Read light position, radius from DataTexture
    b. Convert light world pos → screen UV
    c. Test: circle (light screen pos, light screen radius) vs AABB (tileMin, tileMax)
    d. If no intersection → skip
    e. SDF OCCLUSION CULL: sample SDF at tileCenterUV
       - sdfDist = textureLoad(sdfTexture, tileCenterPixel).r
       - lightDistToTile = length(lightUV - tileCenterUV)
       - If sdfDist < lightDistToTile → wall between tile and light → skip
    f. Store: tileBuffer[tileIndex * blocksPerTile + lightIdx/4].element(lightIdx%4) = lightIndex + 1
    g. lightIdx++; if lightIdx >= MAX_LIGHTS_PER_TILE → break

 Light indices are 1-based (0 = empty sentinel), matching the TiledLightsNode convention.

 SDF culling detail: The SDF stores distance to nearest wall in UV space. If the SDF distance at the tile center is less than the distance from the tile center to the light, there is
 guaranteed to be a wall between them. This culls lights that can't possibly illuminate the tile — before the fragment shader runs.

 Midpoint refinement (optional, adds precision): Also sample SDF at the midpoint between tile center and light. If either sample indicates occlusion, cull.

 ---
 Step 3: Tiled Fragment Shader

 File: packages/core/src/lights/LightingSystem.ts

 Add a createTiledColorTransform() method alongside the existing createColorTransform().

 Tile lookup in fragment shader:
 // Compute which tile this fragment belongs to
 const tileXY = screenCoordinate.div(float(TILE_SIZE)).floor()
 const tileIndex = tileXY.y.mul(float(tileCountX)).add(tileXY.x)

 // Loop over lights in this tile
 Loop(MAX_LIGHTS_PER_TILE, ({ i }) => {
   const stride = int(4)
   const blockOffset = i.div(stride)
   const elementOffset = i.mod(stride)
   const bufferIndex = tileIndex.mul(int(2)).add(blockOffset) // 2 blocks per tile
   const lightIndex = tileBuffer.element(bufferIndex).element(elementOffset)

   // 0 = empty sentinel → early break
   If(lightIndex.equal(int(0)), () => { Break() })

   // Fetch light data (1-based → 0-based)
   const data = getLightData(lightIndex.sub(int(1)))
   // ... same attenuation + shadow math as non-tiled path
 })

 createTiledColorTransform(): Same structure as createColorTransform() but:
 - Accepts tileBuffer, tileCountX as parameters
 - Uses screenCoordinate for tile lookup instead of looping all lights
 - Fragments only process lights assigned to their tile
 - Same shadow, normal, rim, glow logic per-light

 Flatland integration: When tiling is enabled, use createTiledColorTransform() instead of createColorTransform() for lit sprites. The _processPendingLitSprites() method selects the
 appropriate path.

 ---
 Step 4: Mipmapped Radiance (Indirect GI)

 New file: packages/core/src/lights/RadianceBuffer.ts

 Renders lights as colored circles to a low-resolution RT, generates mipmaps, and provides the texture for indirect GI sampling in the fragment shader.

 class RadianceBuffer {
   private _radianceRT: WebGLRenderTarget  // 1/4 screen resolution
   private _radianceScene: Scene
   private _radianceCamera: OrthographicCamera
   private _lightMeshes: Mesh[]  // One circle mesh per light

   init(width: number, height: number): void
   resize(width: number, height: number): void
   update(renderer: WebGPURenderer, lights: Light2D[], camera: OrthographicCamera): void
   dispose(): void

   get radianceTexture(): Texture  // has mipmaps
 }

 Radiance RT setup:
 this._radianceRT = new WebGLRenderTarget(width / 4, height / 4, {
   generateMipmaps: true,
   minFilter: LinearMipmapLinearFilter,  // enable mip sampling
   magFilter: LinearFilter,
 })

 Render pass: For each active light, render a colored circle (CircleGeometry + MeshBasicMaterial with light color × intensity) at the light's position with radius matching the light's
 radius. This creates a low-res "light footprint" texture.

 Fragment shader sampling (in LightingSystem's color transform):
 // Sample SDF at this fragment to determine mip level
 const sdfDist = sampleTexture(sdfTexture, surfaceUV).r
 // Higher SDF = more open space = sample broader mip for "light bleeding"
 // Map SDF distance (0..maxDist) → mip level (0..maxMip)
 const maxMip = float(4) // log2(radianceRT.width / tileSize) approximately
 const mipLevel = sdfDist.mul(maxMip).div(float(0.3)).clamp(0, maxMip)

 // Sample radiance texture at the mip level
 const indirect = sampleTexture(radianceTexture).level(mipLevel)

 // Add indirect contribution (scaled by user-configurable intensity)
 totalLight.addAssign(indirect.rgb.mul(radianceIntensity))

 Why this works: At mip level 0, you see individual light circles. At mip level 4, the entire texture is blurred into an average color. Near walls (low SDF), you sample sharp mips →
 only nearby lights bleed. In open areas (high SDF), you sample blurry mips → distant lights contribute ambient color. This simulates light bouncing around corners for nearly zero cost.

 New uniforms in LightingSystem:
 - _radianceTexture: Texture | null
 - _radianceIntensityNode: uniform(float) — user-tunable indirect GI strength (default 0.3)

 New public API:
 get radianceIntensity(): number
 set radianceIntensity(value: number)
 setRadianceTexture(texture: Texture): void

 ---
 Step 5: Integration in Flatland

 File: packages/core/src/Flatland.ts

 Wire all new systems into the render loop.

 New state:
 private _tiledLightCuller: TiledLightCuller | null = null
 private _radianceBuffer: RadianceBuffer | null = null

 Updated render loop (render() method):
 1. _syncGlobals(renderer)
 2. _update3DLights()
 3. _syncAndRenderOcclusion(renderer)       // existing — produces SDF
 4. _syncLightUniforms()                     // now writes to DataTexture
 5. _updateTiledLights(renderer)             // NEW — dispatch compute
 6. _updateRadiance(renderer)                // NEW — render light circles + mipmap
 7. _processPendingLitSprites()              // selects tiled vs non-tiled transform
 8. spriteGroup.update()
 9. _ensurePostProcessing(renderer)
 10. render scene

 _updateTiledLights(renderer): If tiling enabled, lazily init TiledLightCuller, then call update().

 _updateRadiance(renderer): If radiance enabled, lazily init RadianceBuffer, render light circles, wire texture to LightingSystem.

 New Flatland options / properties:
 // In FlatlandOptions:
 tiling?: boolean     // enable Forward+ tiling (default: false)
 radiance?: boolean   // enable mipmapped radiance GI (default: false)

 // Properties:
 get tiling(): boolean
 set tiling(value: boolean)
 get radiance(): boolean
 set radiance(value: boolean)

 Dispose: Clean up TiledLightCuller and RadianceBuffer.

 Resize: Resize TiledLightCuller (recompute tile grid) and RadianceBuffer (resize RT).

 ---
 Step 6: Update exports and example

 File: packages/core/src/lights/index.ts
 - Remove MAX_LIGHTS export (no longer a hard cap)
 - Add TiledLightCuller export
 - Add RadianceBuffer export

 File: examples/vanilla/knightmark/main.ts
 - Enable tiling: flatland.tiling = true (or via constructor)
 - Enable radiance: flatland.radiance = true
 - Add 20+ lights to stress-test tiling
 - Add debug minimap showing: tile grid overlay, radiance texture
 - Add GUI controls for radianceIntensity

 ---
 Cross-Platform Compatibility
 ┌───────────────────────────┬────────────────────────┬────────────────────────┬────────────────────────────────────┐
 │         Component         │         WebGPU         │        WebGL 2         │               Notes                │
 ├───────────────────────────┼────────────────────────┼────────────────────────┼────────────────────────────────────┤
 │ JFA SDF                   │ Fragment shader passes │ Fragment shader passes │ Works on all targets               │
 ├───────────────────────────┼────────────────────────┼────────────────────────┼────────────────────────────────────┤
 │ Sphere trace shadows      │ Texture sampling       │ Texture sampling       │ Works on all targets               │
 ├───────────────────────────┼────────────────────────┼────────────────────────┼────────────────────────────────────┤
 │ DataTexture lights        │ textureLoad            │ textureLoad (WebGL 2)  │ Works on all targets               │
 ├───────────────────────────┼────────────────────────┼────────────────────────┼────────────────────────────────────┤
 │ Forward+ tiling (compute) │ Compute shader         │ Not available          │ WebGL falls back to non-tiled loop │
 ├───────────────────────────┼────────────────────────┼────────────────────────┼────────────────────────────────────┤
 │ Radiance mipmaps          │ Mipmap sampling        │ Mipmap sampling        │ Works on all targets               │
 └───────────────────────────┴────────────────────────┴────────────────────────┴────────────────────────────────────┘
 WebGL fallback: When compute shaders are unavailable, tiling is silently disabled. The fragment shader uses the non-tiled createColorTransform() path — looping over all lights via
 DataTexture. DataTexture + SDF shadows + radiance still work. Tiling is a pure optimization for WebGPU.

 ---
 Performance Budget

 Per-Phase Costs

 - SDF generation: ~10 fragment passes at occlusion resolution. < 0.5ms on any GPU.
 - Tile compute: 1 compute dispatch per frame. < 0.1ms for 32×32 tiles.
 - Radiance render: 1 draw call per active light (circle meshes). < 0.2ms for 32 lights at 1/4 resolution.
 - Sphere trace: 16 texture samples per light per fragment (worst case). Tiling reduces this to only lights in the fragment's tile.

 Light Count Guidelines (with tiling)
 ┌─────────────────┬─────────────┬──────┬─────────────────────────────────────────────────┐
 │    Platform     │ Recommended │ Max  │                      Notes                      │
 ├─────────────────┼─────────────┼──────┼─────────────────────────────────────────────────┤
 │ Desktop WebGPU  │ 32-64       │ 128+ │ Tiling limits per-fragment loop to ~8-16 lights │
 ├─────────────────┼─────────────┼──────┼─────────────────────────────────────────────────┤
 │ Desktop WebGL 2 │ 8-16        │ 32   │ No tiling, full loop over all lights            │
 ├─────────────────┼─────────────┼──────┼─────────────────────────────────────────────────┤
 │ Mobile          │ 4-8         │ 16   │ Fragment ALU bottleneck                         │
 └─────────────────┴─────────────┴──────┴─────────────────────────────────────────────────┘
 ---
 Files Modified (Phase 2+3)
 ┌──────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────┐
 │                     File                     │                                 Action                                 │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
 │ packages/core/src/lights/LightingSystem.ts   │ MODIFY — DataTexture storage, tiled color transform, radiance uniforms │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
 │ packages/core/src/lights/TiledLightCuller.ts │ CREATE — compute shader tile assignment with SDF culling               │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
 │ packages/core/src/lights/RadianceBuffer.ts   │ CREATE — mipmapped radiance for indirect GI                            │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
 │ packages/core/src/Flatland.ts                │ MODIFY — wire tiling + radiance into render loop, new options          │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
 │ packages/core/src/lights/index.ts            │ MODIFY — update exports                                                │
 ├──────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
 │ examples/vanilla/knightmark/main.ts          │ MODIFY — stress test with 20+ lights, tiling + radiance demo           │
 └──────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────┘
 ---
 Verification (Phase 2+3)

 1. pnpm typecheck — no type errors
 2. pnpm build — clean build
 3. Run knightmark (pnpm --filter=example-vanilla-knightmark dev):
   - DataTexture: 20+ lights render correctly (no uniform limit)
   - Tiling: Enable tiling → same visual result as non-tiled, better perf with many lights
   - SDF culling: Lights behind walls don't illuminate tiles on the other side
   - Radiance: Enable radiance → colored light "bleeds" around wall corners
   - Radiance + SDF: Near walls, indirect light is sharp/local. In open areas, it's broad/ambient.
   - Debug minimap: Shows tile grid overlay and radiance mipmap texture
   - WebGL fallback: Tiling disabled gracefully, DataTexture + shadows + radiance still work
 4. Performance: 32 lights + tiling + shadows should maintain 60 FPS on desktop