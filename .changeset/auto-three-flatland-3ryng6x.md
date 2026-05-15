---
"three-flatland": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting pipeline**
- `Light2D` scene light with `castsShadow`, `importance`, `category` (string, djb2-hashed to 4 fill buckets), and `clone()` fix
- `ForwardPlusLighting`: tiled Forward+ CPU culling with CPU tile alignment fix (eliminates checkerboard gap), `TILE_SIZE` 16→32, per-category fill quotas, importance-sorted insertion
- `SDFGenerator`: JFA-based signed SDF via dual-chain → packed single-chain (same VRAM cost as unsigned SDF); default resolution scale lowered to 0.5
- `OcclusionPass`: elevation-aware shadow tracing using the signed SDF; sprites self-shadow via per-sprite `shadowRadius`
- `LightEffect` registry: `DefaultLightEffect`, `DirectLightEffect`, `SimpleLightEffect` registered by name; scene resolves effects at render time

**Per-sprite shadow radius**
- `shadowRadius` auto-derived from sprite scale when not explicitly set; stored in the interleaved instance buffer as a packed `uint16` (0–255 cm with 0.01 cm precision)
- Shadow radius drives both occlusion and SDF source mask; uniform fallback removed

**Interleaved instance buffer**
- Collapses 3 WebGPU vertex buffer bindings into 1 interleaved `StructuredArray` (`position`, `scale`, `rotation`, `color`, `shadowRadius`, `systemFlags`, `enableBits`, `litFlag`, `flipX`)
- Brings binding count from 8+ down to 5; eliminates WebGPU device limit (`maxVertexBuffers = 8`)
- TSL instance attribute helpers (`readFlip`, `readSystemFlags`, `readEnableBits`, `readLitFlag`) moved to `materials/instanceAttributes.ts`

**Loaders**
- `NormalDescriptorLoader` for `.normal.json` sprite-sheet normal maps; auto-registered in LDtk and Tiled pipelines alongside the texture loader
- `.normal.json` sidecars discovered by the bake CLI; loader resolves at runtime without manual registration

**Debug pipeline**
- `DebugTextureRegistry` — named slots; textures registered with `maxDim` cap for GPU readback
- Texture readback deferred to end-of-frame so captures reflect complete render output
- VP9 key-frame forced on new subscriber and on buffer switch
- GPU timing via `EXT_disjoint_timer_query_webgl2`; polled at 10 Hz, exposed to devtools stats graph
- `DebugTextureRegistry` entries for: signed SDF, occlusion mask, Forward+ tile texture, LightStore `DataTexture`, Radiance/cascade intermediates (WIP)

**Devtools integration**
- `createDevtoolsProvider()` exported from `three-flatland` for vanilla Three.js apps that don't use `Flatland`
- Bus worker URL uses extensionless path for `dist/` compatibility (avoids `.js` extension mismatch)
- `DevtoolsProducer.beginFrame()`/`endFrame()` wrap the full `Flatland.render()` body; FPS and draw stats aggregate across all internal passes

**Radiance Cascades (WIP)**
- Foundation pass infrastructure in place; cascade merge and final composite not yet wired to output

Adds a complete 2D lighting pipeline — signed JFA SDF, elevation-aware shadow occlusion, tiled Forward+ culling, and per-sprite shadow radius — alongside a new interleaved instance buffer that eliminates the WebGPU 8-buffer binding limit.
