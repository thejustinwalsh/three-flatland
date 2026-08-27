# Shadow-occluder projection

Status: **rejected, closed**

Ledger: `ECS-009`

## Goal

Remove full-scene traversal and per-regeneration material discovery from the shadow occlusion pass while
preserving the exact alpha silhouette, `castsShadow` behavior, camera layers, custom scene content, and
resource lifecycle.

The target is a persistent renderer-owned occluder projection. Replacing `scene.traverse()` with a
different loop over the same object population is not sufficient.

## Koota lineage

[Koota](https://github.com/pmndrs/koota) made this design direction possible. Its system and query model
showed how stable membership can be projected once and processed densely. Flatland specializes that
lesson for shadow-render resources; Koota remains the recommended general-purpose ECS for application
and gameplay state.

## Current boundary

`OcclusionPass.render()` currently:

1. traverses the complete Flatland scene whenever the shadow pipeline is dirty,
2. discovers meshes using `Sprite2DMaterial`,
3. swaps each eligible mesh to a cached per-texture occlusion material,
4. hides incompatible meshes,
5. renders the scene, then restores every material and visibility flag.

The surrounding shadow system already suppresses work when camera and occluder revisions are unchanged.
This proposal targets the dirty regeneration path, not clean frames.

## Authoritative ownership

- Sprite, tile, material, texture, geometry, camera, and Three.js scene identity remain object-owned.
- `castsShadow` remains the packed per-instance flag consumed by the occlusion shader.
- The private world remains authoritative for batch membership and renderer lifecycle.
- The new projection may own only derived occluder membership, source revisions, and reusable render
  views. It cannot become a second public scene graph.

## Candidate design

Introduce a package-private `OccluderProjection` owned by the shadow pipeline.

The projection maintains one entry per renderable batch or tile chunk:

- source mesh identity and lifecycle revision,
- source geometry and current instance count,
- source texture/tight-mesh material key,
- cached occlusion material,
- camera-layer mask and effective visibility,
- stable shadow-view mesh when a separate render scene proves beneficial.

Membership updates originate at existing structural boundaries: batch creation/retirement, material
schema replacement, tile chunk publication/retirement, layer visibility, and terminal disposal. Numeric
row changes continue through shared geometry buffers and the existing occluder-dirty revision.

Two implementations are benchmarked behind the same projection interface:

### A. Cached source-mesh swap list

Render the authoritative scene but swap only the cached eligible mesh list. This removes discovery
traversal while retaining the current render topology.

### B. Persistent shadow-view scene

Create one shadow-only mesh view per source mesh, sharing geometry and using the cached occlusion
material. Render a dedicated scene containing only those views. This removes both discovery and
swap/restore work, but adds object/resource ownership and synchronization obligations.

Candidate B is accepted only if the extra view objects and lifecycle complexity produce a measured
end-to-end benefit over A.

## Foreign-scene compatibility

Custom meshes that use `Sprite2DMaterial` outside managed sprite batches or tile chunks are part of the
existing behavior. The design must choose and test one of these policies before implementation lands:

- register them through an internal scene-topology observer without exposing ECS handles, or
- retain a bounded fallback discovery pass only while foreign candidates exist.

Silently dropping foreign occluders is not an option. A public registration API is outside this plan
unless the alpha API audit approves it separately.

## Benchmark plan

Add `tools/ecs-bench/benches/shadow-occluder-projection.bench.ts` using pinned `@pmndrs/labs` for CPU
preparation and a headed WebGPU fixture for actual shadow-pass validation.

Scenarios:

| Managed meshes/chunks | Foreign meshes | Dirty cadence         | Purpose                              |
| --------------------- | -------------- | --------------------- | ------------------------------------ |
| 32                    | 0              | every frame / 1 in 60 | small-scene regression guard         |
| 256                   | 0 / 16         | every frame           | ordinary moving-caster workload      |
| 2,048                 | 0 / 64         | every frame           | traversal and swap pressure          |
| 2,048                 | 64             | topology churn 1%     | incremental membership and lifecycle |

Vary occlusion-material keys across 1, 8, and 64 textures. Include sprite batches, tile chunks, hidden
layers, camera-layer exclusion, incompatible geometry, and mixed non-sprite scene objects.

The CPU timed region includes membership synchronization, view preparation or swap, and restoration.
The headed fixture records occlusion-pass CPU time, total frame cadence, render submissions, and exact
output hashes/screenshots for representative silhouettes.

## Acceptance gates

- Candidate A or B improves dirty-pass CPU p50 by at least 15% for 256 and 2,048 managed sources with
  `p < .05` and outside Labs' effective noise band.
- The 32-source case remains neutral; a repeatable regression above 3% rejects the candidate.
- Clean shadow frames remain a constant dirty check with zero new allocation.
- The dedicated-view candidate must reduce end-to-end headed shadow-pass time, not only preparation.
- Occlusion output is identical for sprite alpha, atlas frames, flips, tight/synth geometry, tile chunks,
  `castsShadow`, hierarchy visibility, and camera layers.
- Projection memory is grow-only while live, releases all source/view/material references on retirement,
  and leaves no GPU resource after terminal disposal.
- Full package, lighting/shadow, declaration, size, paired-example, and live WebGPU gates remain green.

## Transaction and lifecycle requirements

Membership changes use prepare/publish/retire ordering. A source mesh remains valid until its replacement
projection is committed. Disposal listeners may remove, replace, reparent, or terminalize the source,
projection, `Flatland`, `TileMap2D`, or material; cleanup preserves the first exact thrown value while
draining every owned resource once.

Multiple Flatland worlds, lighting replacement, shadow disable/reenable, nested shadow renders, camera
replacement, render-pipeline replacement, tile data rebuilds, material effects, and direct layer disposal
must not leak or double-dispose projection entries.

## Public and size boundary

`OccluderProjection`, membership hooks, revisions, and shadow-view meshes remain package-private and
unreachable from declarations. Existing `castsShadow`, `receiveShadows`, `LightEffect.needsShadows`, and
camera-layer APIs remain the command surface.

Consumer budgets are reviewed only after a clean candidate capture. A preparation win cannot justify a
runtime-size regression that breaches the existing shipped aggregate caps.

## Evidence checkpoint: no production candidate accepted

Candidate A (`11d1f4c7`) cached scene mesh membership through Three.js topology events. It improved the
256-source preparation cases by 16.3–18.1%, but changed the 2,048-source cases by +1.6% and +15.6%.
Discovery was not the dominant large-scene cost, so the change was reverted at `b6cca52f`.

Benchmark-only candidate B (`c2563f9e`) established the preparation ceiling of a retained view: once
views exist, a camera-only dirty pass has no discovery or swap/restore work. The authoritative path's
clean p50 was 1.8140–2.0287 µs at 32 sources, 12.7841–13.7029 µs at 256, and
175.7090–202.1250 µs at 2,048. The retained-view stub fell below useful timer resolution, so it is not
an end-to-end speed claim.

Production candidate B is rejected by the semantic stop condition. The current pass renders the
authoritative scene, including foreign meshes, lines/points, lights, hierarchy visibility, layers, and
user-extensible render callbacks on the original object identities. A dedicated scene can preserve that
behavior only by mirroring the full render graph and continuously reconciling callback/material/lifecycle
state, which makes it a second authoritative scene graph. Restricting the view to managed sprites would
silently drop existing foreign/custom occluders or require a second fallback render with equivalent
hide/restore work.

No production code from either candidate remains. Reopen only when Three.js exposes a stable render-list
filter/override boundary that preserves original object identity without scene mutation.

## Execution order

1. Freeze the current traversal/swap behavior and output as the baseline.
2. Implement the membership projection and candidate A.
3. Run behavior, lifecycle, allocation, and Labs gates.
4. Prototype B only if A leaves material swap/restore as a measured dominant cost; reject it if exact
   behavior requires a second authoritative scene graph.
5. Run headed WebGPU parity and Three.js/react-three-fiber lighting examples for the winning candidate.
6. Record the accepted or rejected result in `ECS-009` with exact source and evidence hashes.

## Stop conditions

Reject the feature if managed membership cannot preserve foreign occluders, the projection becomes a
second authoritative scene graph, dirty shadow work is GPU-bound enough that CPU preparation changes are
neutral, or terminal lifecycle requires public hooks.
