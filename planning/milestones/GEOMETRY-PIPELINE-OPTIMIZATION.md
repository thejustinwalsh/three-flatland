# Geometry pipeline optimization — vertex-binding reclaim + tight-mesh overdraw reduction

**Status:** Design draft  ·  **Owner:** TBD  ·  **Authored:** 2026-05-17  ·  **Revised:** 2026-05-17 (trait-batch framing corrected per `RENDERING-ARCHITECTURE.md`)

> **Cross-ref:** decision on "tag batches with classifying traits vs branch on `material.transparent`" is settled in `RENDERING-ARCHITECTURE.md` — *trait existence declares the architectural fact; query-vs-branch is a per-system tuning knob.* For batch-level paths (alpha-test vs alpha-blend, lit vs unlit) the workload is "few stable batches, perfectly-predicted branches"; branch in the existing system loop. Tag the batches with traits so future high-batch-count workloads (procedural scenes, particle storms) can flip individual systems to query-narrowing without changing the data model.

Two related changes to the geometry layer of the batching pipeline, naturally grouped because they share a `transparent` / blend-mode branch point in the material layer:

1. **Reclaim vertex-buffer bindings on the alphaTest path** by dropping `PlaneGeometry` and synthesizing the unit-quad corner from `vertexIndex` in the vertex shader.
2. **Reduce overdraw on the alpha-blend path** by using tight per-frame meshes baked from atlas alpha shapes.

Both are pure perf wins. Neither changes the public API. They route automatically off the material's blend mode.

---

## Motivation

### Constraint #1: WebGPU vertex-buffer cap is the tightest knob in the pipeline

`SpriteBatch` currently consumes all 8 portable vertex-buffer bindings:

```
3  PlaneGeometry (position, normal, uv)
1  instanceMatrix
1  interleaved core   (instanceUV / Color / System / Extras)
3  effectBuf0..2      (MAX_EFFECT_FLOATS = 12)
= 8
```

That `3` for PlaneGeometry forces `MAX_EFFECT_FLOATS = 12`, which is itself the tightest constraint a user can hit when composing effects (4–6 effects can blow the cap depending on per-effect schema size). Every binding spent on geometry is one fewer slot of per-instance effect data.

### Constraint #2: Alpha-blend overdraw is fragment cost we can't recover

`alphaTest > 0` materials `discard` transparent fringe fragments before the blend stage — fringe pixels cost roughly a texture sample. For these materials, an oversized quad is essentially free.

Alpha-blend materials don't get that escape. Every fringe pixel runs the full fragment shader (atlas sample + UV flip + tint + N effects), then blends with the destination — typically `mix(dst, src, ~0)` that writes back ≈ dst. For a circular sprite in a square quad, ~79% of the quad is wasted shading. With multiple stacked transparent sprites (particles, soft effects, motion trails), this dominates the frame.

The lighting branch makes this worse: lit fragment shaders are 3–5× more expensive than unlit. Doing that work on transparent fringe pixels is pure waste.

---

## Solution shape

The material's blend mode already cleanly splits the two paths and they already batch separately (different `materialId` → different run). The geometry strategy can mirror that split:

| Material mode      | Geometry              | Vertex source              | Why                                         |
| ------------------ | --------------------- | -------------------------- | ------------------------------------------- |
| `alphaTest > 0`    | Index buffer only     | Synthesized from `vertexIndex`  | Discard kills fringe; cheap quad is enough  |
| `transparent: true` | Tight per-frame mesh  | Per-batch geometry buffer  | Fringe blend cost is real; fit the silhouette |

The library picks the right path from the material; the user never sees the split.

---

## Part 1 — Synthesized unit quad (alphaTest path)

### Geometry change

```ts
// SpriteBatch.ts — replace `new PlaneGeometry(1, 1)`
const geometry = new BufferGeometry()
geometry.setIndex([0, 1, 2,  2, 1, 3])
geometry.boundingSphere = new Sphere(new Vector3(), Infinity)
// frustumCulled is already false on SpriteBatch
```

No position, normal, or uv attributes. Three takes the draw count from `index.count = 6`.

### Shader change

Override `positionNode` in `Sprite2DMaterial` so the vertex stage synthesizes the local corner from `vertexIndex`:

```ts
import { vertexIndex, float, vec2, vec3, mod, floor, varying, normalize } from 'three/tsl'

const vid = float(vertexIndex)
const u = mod(vid, float(2))            // 0,1,0,1
const v = floor(vid.div(float(2)))      // 0,0,1,1

this.positionNode = vec3(u.sub(0.5), v.sub(0.5), 0)
this._cornerUV = varying(vec2(u, v))    // replaces uv() in _buildBaseColor
```

For the lit material (lighting branch), derive the normal from `instanceMatrix` so it tracks any sprite rotation:

```ts
this.normalNode = normalize(mat3(instanceMatrix).mul(vec3(0, 0, 1)))
```

### Vertex layout, post-change

```
0  geometry attrs           ← was 3
1  instanceMatrix
1  interleaved core
N  effectBuf0..N-1
= 2 + N
```

Effect budget grows from 3 buffers (12 floats) to up to 6 buffers (**24 floats**), or stay at 12 and bank 3 spare bindings for future per-instance data (per-sprite light masks, per-sprite shadow params, etc.).

### Caveats

- Three's `WebGPURenderer` may have internal asserts expecting a `position` attribute during pipeline creation. Verify on a spike branch before merging.
- Winding order: confirm `[0,1,2, 2,1,3]` produces front-facing triangles under three's default `FrontSide`. If reversed, swap to `[0,2,1, 2,3,1]`.
- Quad-only. Custom non-quad sprite geometries are not supported by this path. Not currently a feature; flag in migration notes.

### Scope

~30 lines across `SpriteBatch.ts`, `Sprite2DMaterial.ts`, and the lighting branch's lit subclass. Interleaved buffer, dirty tracker, effect system, ECS — all untouched.

---

## Part 2 — Tight per-frame meshes (alpha-blend path)

### The wrinkle: per-instance geometry doesn't play with instanced batching

Within an instanced batch, one geometry serves N instances. Sprites in the same batch use different atlas frames (`instanceUV` varies per slot) and therefore want different tight meshes. Vertex attributes can't carry per-instance variation.

Two workable shapes, on a complexity/precision tradeoff.

### Option A — shared per-batch envelope (simple, ~3× overdraw recovery)

All sprites in the batch use the same n-gon (octagon or dodecagon, ~8–16 verts). Computed at bake time as the convex hull of the union of all alpha shapes on the atlas page.

```
SpriteBatch geometry:
  positions:  Float32Array of n × vec3  (local space, scaled to [-0.5..0.5])
  uvs:        Float32Array of n × vec2  (matching corners in [0..1])
  index:      Uint16Array of (n-2) × 3 triangles (ear-clip / fan)
```

Vertex bindings: position + uv = 2 (vs 3 for default PlaneGeometry). Still one binding saved over today's default.

**When this fits:** UI atlases, single-character animation sheets where all frames share rough silhouette, sprite atlases where most variation is internal detail.

**When it falls apart:** mixed-content atlases (UI icons + character frames + particles on one page). The convex hull degrades to "the bounding box" and you've gained nothing.

### Option B — per-frame mesh table, indexed in the vertex shader (Spine/Unity-2D approach)

Bake a tight polygon per atlas frame. Store the vertex data in a **shared lookup texture** (or storage buffer when WebGPU is the only target):

```
meshTable:  RGBA32F texture of size [maxVertsPerFrame × numFrames]
            each texel = (localX, localY, u, v)
```

Atlas JSON gains per-frame mesh data:

```json
{
  "frames": {
    "knight_idle_00": {
      "x": 0, "y": 0, "w": 64, "h": 96,
      "mesh": {
        "verts": [[-0.42, -0.5, 0.04, 0.0], [0.42, -0.5, 0.96, 0.0], ...],
        "indices": [0, 1, 2,  2, 1, 3,  ...]
      }
    }
  }
}
```

Per-instance attribute: `frameMeshOffset` (uint, points to the row in `meshTable`). Already have a free per-instance slot in `instanceExtras` after dropping `PlaneGeometry`'s bindings.

Vertex shader:

```ts
const vid = vertexIndex
const meshOffset = attribute<'vec4'>('instanceExtras').y   // packed slot
const texel = texture(meshTable, ivec2(vid, meshOffset))    // (x, y, u, v)
this.positionNode = vec3(texel.x, texel.y, 0)
this._cornerUV = varying(vec2(texel.z, texel.w))
```

Geometry is an index buffer sized `maxVertsPerFrame * 3 * (maxVerts - 2) / 3` indices — fixed per batch. Frames with fewer verts than `maxVerts` collapse degenerate triangles (or bin batches by mesh complexity to avoid the waste).

**When this fits:** character animation atlases with varying silhouettes, particle systems, complex sprite scenes. 5–10× overdraw recovery on alpha-blend particles is realistic.

**Cost:** one extra texture sample per vertex (cheap — 4 verts per draw for simple meshes), one extra per-instance slot, atlas bake step grows.

---

## Bake-time tooling

### Atlas format extension

Backwards-compatible. Frames without `mesh` data fall back to the synthesized unit quad regardless of blend mode (no per-frame mesh = no overdraw recovery, but nothing breaks).

```json
{
  "frames": {
    "<frame>": {
      "x": number, "y": number, "w": number, "h": number,
      "mesh"?: {
        "verts": [[localX, localY, u, v], ...],   // local in [-0.5..0.5], uv in [0..1]
        "indices": [number, ...]                  // triangulation
      }
    }
  }
}
```

### Polygon generation

Per frame:

1. Extract alpha channel of the frame's pixels.
2. Threshold to binary mask (alpha > N, typical N = 8/255).
3. Walk the contour (Moore-Neighbor or marching squares).
4. Simplify with Douglas-Peucker; target vertex budget per frame (default: 8 verts, configurable).
5. Ear-clip triangulate.
6. Normalize coords to local-quad space.

Vertex budget knob in the baker config — lets the user trade mesh precision vs vertex count per frame.

### Existing tooling integration

- **TexturePacker** has "polygon trim" mode — emits per-frame mesh natively. Reader change only.
- **Aseprite** doesn't ship this; would need a baker script (Node or Lua, run as part of asset pipeline).
- **Custom baker** (`@three-flatland/atlas`?) — small package. Reuse for both options A and B (option A is just "run the polygonizer once on the page, not per frame").

---

## Migration plan

### Phase 1 — Part 1 in isolation (vertex-binding reclaim)

1. Spike: stripped geometry + synthesized corner on a side branch. Verify three.js compatibility (pipeline creation, bounds, frustum culling already false).
2. Land in `Sprite2DMaterial` + `SpriteBatch`. No atlas changes, no user-facing changes.
3. Bump `MAX_EFFECT_FLOATS` from 12 to 24 in a follow-up PR (or leave at 12 for one release and bump after soak).
4. Knightmark stays green; effect-heavy scene benchmarks should show no regression (slight FPS bump expected from saved vertex fetch + binding state).

### Phase 2 — Atlas mesh format

1. Extend atlas reader to parse `mesh` data (no-op if absent).
2. Storage in `Atlas2D` runtime — per-frame mesh buffer (`Float32Array` of vertices, `Uint16Array` of indices, byte offsets per frame).
3. Tooling: pick **either** TexturePacker integration **or** a small custom baker package. Document the bake step.

### Phase 3 — Part 2 alpha-blend path (option A first, B if needed)

1. `Sprite2DBlendMaterial` (or `transparent: true` material variant) — same `Sprite2DMaterial` lineage but blend pipeline + tight-mesh geometry.
2. `SpriteBatch` accepts a per-batch geometry strategy from the material; defaults to synth-quad.
3. Run a particle/soft-effect benchmark to validate overdraw recovery.
4. If option A's per-batch envelope isn't tight enough for the target scenes, escalate to option B (per-frame mesh table). Don't speculate; measure.

### Phase 4 — Lighting branch integration

The lighting branch is the biggest beneficiary on the alpha-blend path (most expensive fragment shader). Merge Part 1 + Part 2 first on main, then rebase lighting on top.

---

## Open questions

1. **Does three.js's WebGPURenderer require a `position` attribute on the BufferGeometry?**  Spike answer this before committing to Part 1.
2. **Where does `frameMeshOffset` live?**  Free slots in `instanceExtras` after dropping `PlaneGeometry`, or its own per-instance attribute? Probably `instanceExtras.y` (currently reserved).
3. **Mesh-table storage: texture vs storage buffer?**  Storage buffer is cleaner on WebGPU but breaks WebGL2 fallback. Texture works everywhere, costs an extra texelFetch per vertex.
4. **Per-batch geometry mutability.**  Currently `SpriteBatch` builds its geometry in the constructor. Per-frame mesh table needs the atlas to be loaded first — fine for current call sites (atlas is set before sprites are added), but if anyone ever wants hot atlas-swap, geometry needs to rebuild.
5. **Bake tooling ownership.**  Adopt TexturePacker's polygon format (third-party dependency for users) or ship a first-party baker as `@three-flatland/atlas`? Probably the latter — small package, controllable output, no licensing concerns.
6. **Acceptance threshold for option A → B escalation.**  Need a concrete scene benchmark. Knightmark with particles? A dedicated overdraw stress demo?

---

## Acceptance criteria

### Part 1 — vertex-binding reclaim

- [ ] `SpriteBatch` constructor no longer instantiates `PlaneGeometry`
- [ ] Vertex shader synthesizes corner position + UV from `vertexIndex`
- [ ] `MAX_EFFECT_FLOATS` raised to at least 16 (3 → 4 effectBufs); ideally 24
- [ ] All existing examples render identically (visual diff regression test)
- [ ] Knightmark holds 60 fps at current sprite count
- [ ] No new shader-compile warnings in WebGPU or WebGL2 paths
- [ ] Sprite rotation (Z and arbitrary axes) renders correctly — covered by an existing or new example

### Part 2 — tight-mesh overdraw reduction

- [ ] Atlas format extension documented; reader handles `mesh` field
- [ ] Tight-mesh geometry path lands behind material blend mode (no user API change)
- [ ] Frames without mesh data fall back to synth-quad with no errors
- [ ] Soft-particle benchmark scene shows ≥ 2× FPS improvement vs current default (option A target; B if A insufficient)
- [ ] Lighting branch fragment cost drops measurably on the same scene
- [ ] Bake tooling documented end-to-end (either TexturePacker config or `@three-flatland/atlas` README)

---

## Out of scope

- Custom non-quad sprite geometries (user-supplied meshes for decals, etc.) — separate feature.
- 9-slice / capsule sprites — handled at the shader level today; orthogonal to this work.
- Billboards (camera-facing in view space) — different vertex-shader path entirely; if added, lives alongside these as a third material variant.
- GPU-side culling / occlusion — out of scope; the wins here are on the per-fragment side.
