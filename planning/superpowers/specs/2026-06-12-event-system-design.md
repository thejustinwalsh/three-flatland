# Event System — Design Spec

> **Status:** Decisions locked via stakeholder review 2026-06-12. Ready for `superpowers:writing-plans`.
> **Supersedes:** `planning/EVENT-SYSTEM.md` from the `feat-events` PoC (`d24fd704`, April 2026) — harvested, corrected, and re-grounded against the current architecture. Sections kept, dropped, or rewritten are cited inline.
> **Doubles as:** the missing P4 picking spec called for by `2026-05-27-card-game-showcase-prerequisites.md` ("P4 — Picking / hit-testing — NOT SCOPED").
> **Depends on:** Phase 2 orchestration epic #85 (per-(renderer,scene) registry, lazy materialization, auto-batch) for batched-sprite interactivity. Standalone primitives do not depend on it.

---

## 1. Goal

Pointer interactivity for three-flatland primitives that is **canonical first**: implement three.js's `Object3D.raycast(raycaster, intersects)` contract correctly and let the ecosystems do the rest. R3F's `onPointer*` props, event bubbling, `stopPropagation`, pointer capture, and `onPointerMissed` all derive from that one contract; vanilla three.js users get plain `Raycaster` picking with zero additional machinery.

No flatland-specific event bus. No new dependencies. The library's entire obligation is to answer "did this ray hit you, and where" — honestly, cheaply, and with the right identity.

## 2. Locked decisions

These were resolved in stakeholder review (2026-06-12) and are not open for re-litigation at plan time:

| #   | Decision                                      | Resolution                                                                                                                                                                                                        |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Batched-sprite interactivity vs Phase 2 (#85) | **Document the gap, no interim code.** Sprites inside today's `SpriteGroup`/`Flatland` are ECS-only (not scene-graph children) and stay non-interactive until #85 makes them graph citizens. Zero throwaway code. |
| D2  | Alpha hitmask sidecar format                  | **Single-channel PNG** (`<source>.alpha.png`) — reuses `writeSidecarPng` + tEXt hash stamp + `probeBakedSibling` verbatim from the normals pipeline.                                                              |
| D3  | Alpha map attachment point                    | **Resolved in this spec — see §8.4.** `SpriteSheet.alphaMap` (asset carrier, mirrors `normalMap`) + `Sprite2D.alphaMap` (instance consumer slot). ECS trait deferred to Phase 2 if acceleration needs it.         |
| D4  | `@pmndrs/pointer-events`                      | **Out entirely.** It was research scaffolding in the PoC; it does not appear in source, examples, or docs. The vanilla path is plain `Raycaster`.                                                                 |

## 3. Canonical contracts (ground truth, verified against installed sources)

### 3.1 three.js (`three@0.183.1`)

- `Object3D.raycast(raycaster, intersects)` is a no-op stub; implementors **push intersection records** into `intersects`. The dispatcher (`Raycaster.intersectObject`) sorts by `distance` afterward.
- **Returning `false` from `raycast` suppresses recursion into children.** Returning nothing allows it. (The PoC's TileMap2D forgot this — see §7.)
- `raycaster.near`/`far` are enforced **by convention inside each implementation**, not by the dispatcher.
- `object.layers.test(raycaster.layers)` gates the call; layer mismatch skips `raycast` but still recurses children.
- Intersection record shape (Mesh canonical): `{ distance, point (world, cloned), object, face|null, faceIndex, uv, normal, ... }`. Instancing precedents: `InstancedMesh` sets `object = this` + `instanceId`; `BatchedMesh` sets `object = this` + `batchId`.
- three has **no pointer-event system**. `Raycaster` is the sole picking primitive; `EventDispatcher` is a plain custom-event bus used for scene-graph lifecycle only.

### 3.2 React Three Fiber (`@react-three/fiber@10.0.0-alpha.2`, webgpu line)

- R3F raycasts only objects in its flat **interaction list** — objects with at least one event handler **and `raycast !== null`**. Setting `raycast={null}` removes an object from the list at registration time, not dispatch time.
- The default `events.compute` maps `offsetX/Y` → NDC → `raycaster.setFromCamera(pointer, state.camera)`. **The Canvas camera.**
- Bubbling = ancestor walk: every ancestor with handlers gets its own intersection entry (`eventObject` = ancestor, `object` = actual hit).
- Hit dedup key is `uuid + '/' + index + instanceId` — plain-three callers get no dedup, so implementations must not push duplicates.
- `onPointerOver/Out/Enter/Leave` are synthesized from `pointermove` diffing; `events.update()` re-fires the last pointer event (the canonical fix for hover-while-camera-moves).
- **Portals are the canonical seam for non-default cameras.** `createPortal(children, container, { events: { compute, priority } })` gives the portal its own store, raycaster, and pointer; R3F calls the portal's `compute(event, portalState, parentState)` lazily once per portal root per event. A compute that never calls `setFromCamera` leaves `raycaster.camera === undefined`, which R3F nulls — silencing that root. drei's `View` uses exactly this mechanism.

## 4. Current architecture facts that shape the design

1. **Standalone `Sprite2D` is a plain Mesh** and already pickable via inherited `Mesh.raycast()` (the `examples/react/basic-sprite` R3F events work today because of this). This spec replaces the inherited triangle test with purpose-built 2D hit modes.
2. **`SpriteGroup.add(sprite)` enrolls in ECS without `super.add()`** — the sprite is not a scene-graph child; only `SpriteBatch` InstancedMeshes exist in the graph, inside `flatland.scene` (a private Scene, rendered with a private orthographic camera). Nothing inside is reachable by any raycaster today. This is the D1 gap.
3. **Phase 2 (#85, design canonical in `AUTO-BATCH-DESIGN.md` / `RENDERING-ARCHITECTURE.md`)** keeps Sprite2D a scene-graph citizen whose `instanceMatrix` is slaved to `matrixWorld` when batched, with byte-identical visuals. Operating principle 1: "Every primitive works as a vanilla Object3D in any three.js scene… R3F support falls out for free."

**Consequence — the load-bearing simplification of this spec:** once #85 lands, `Sprite2D.raycast()` is the _only_ hit-test implementation sprites need, standalone or batched. The PoC's `SpriteBatch.raycast()` + `SpriteGroup.getSpriteAtInstance()` reverse-lookup apparatus (old EVENT-SYSTEM.md §3.1, §7) is **deleted from the design**, not deferred. That apparatus was also where the PoC's worst bugs and all of its dead-tree coupling lived.

## 5. The identity contract

> A hit on a flatland primitive yields `intersection.object === <the user-facing primitive>`. Users never see batches, slots, or instance IDs.

This is strictly stronger than the `InstancedMesh`/`BatchedMesh` precedent (container + id) because our per-sprite objects actually exist. It is what makes `<sprite2D onClick={…}>` behave identically whether the sprite is standalone today or auto-batched after #85. Batches never participate in raycasting.

## 6. Hit-test modes (harvested from PoC §6, semantics unchanged)

| Mode       | Mechanism                                                                                               | Cost                  | Default     |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------- | ----------- |
| `'radius'` | `dx² + dy² > rSq` against conservative inscribed circle (`min(halfW, halfH)`); `hitRadius` override     | O(1)                  | `Sprite2D`  |
| `'bounds'` | anchor-aware AABB in local space; `hitBox` override                                                     | O(1)                  | `TileMap2D` |
| `'alpha'`  | bounds pre-check, then CPU alpha sample vs `alphaThreshold` (default 0.5)                               | O(1) + sidecar memory | opt-in      |
| `'none'`   | **null the instance `raycast` property** (R3F skips at registration; prototype restored on mode change) | zero                  | —           |

Mode plumbing: `hitTestMode` getter/setter per class, `static supportedHitTestModes`, `resolveHitTestMode()` with dev-only fallback warning — all portable from the PoC's `HitTestMode.ts` as-is.

## 7. Per-primitive design

### 7.1 `Sprite2D.raycast()`

Transform ray to local space, intersect the Z=0 plane, enforce `near`/`far`, run the active hit mode against the anchored unit quad, push one standard record: world `point` (cloned — the PoC's shared-`Vector3` helper footgun gets fixed in `raycastHelpers`), `distance`, `uv` (0–1 within the sprite, anchor-corrected), `object = this`, `face = null`. In `'alpha'` mode with no alpha map resolved: one-shot dev warning, fall back to the bounds result (PoC behavior, kept).

### 7.2 `TileMap2D.raycast()`

The PoC's O(1) arithmetic lookup, kept: local Z=0 intersection → pixel-bounds check → top-down layer scan → first non-zero GID wins. Record: `faceIndex` = layer index, `uv` = position within the tile. Two corrections over the PoC:

1. **`return false`** — mandatory, to stop three's traversal from recursing into TileLayer InstancedMesh children (phantom-hit bug in the PoC).
2. **Tile coordinates via a typed convenience accessor** (e.g. `tileMap.tileFromIntersection(hit)` → `{ layer, tileX, tileY, gid }`), not an Intersection subtype — the PoC doc's own §12.3 recommendation, adopted.

### 7.3 Batched sprites (SpriteGroup / Flatland-managed)

**Not interactive until #85** (D1). The spec's contract section (§5) is written so that #85's graph-citizenship makes them interactive with zero event-system changes. The docs page and example carry a short note naming the limitation and the epic.

`SpatialGrid` (the PoC's broadphase) is **demoted to optional acceleration**: R3F only raycasts objects that carry handlers, so baseline cost is proportional to _interactive_ count at O(1) each. The grid earns its place only if profiling shows thousands of simultaneously-interactive sprites; if adopted, its PoC bugs (duplicate candidates from multi-cell insert, high-water-mark rebuild) are documented in §11 as required fixes.

## 8. R3F integration

### 8.1 `<flatland>` content — portal + `events.compute`

Content under `<flatland>` renders in `flatland.scene` through `flatland.camera`. The React integration portals children into the internal scene with a portal-local compute:

```
compute(event, portalState, parentState):
  derive NDC from the parent root's pointer (full-viewport flatland)
  portalState.raycaster.setFromCamera(ndc, flatland.camera)
```

Own raycaster per portal (isolation by construction), `priority` above the root so flatland UI wins ties, and the `parentState` argument used exactly as drei's `View` does. This is the PoC's `uvCompute`/`FlatlandTexture` pattern generalized; the `__r3f` fiber-walk fragility it carries is the same risk drei accepts, noted, accepted.

### 8.2 `FlatlandTexture` (render-to-texture)

Same portal mechanism with a UV→NDC compute: raycast the host mesh, take the hit UV, map to portal NDC, re-cast from the flatland camera. Harvest the PoC's `createUvCompute` (the more robust of its two copies — it walks `__r3f` until it finds an `Object3D`, handling material-attached textures).

### 8.3 Hover under a moving camera

When the flatland camera pans/zooms over hoverable content, call `state.events.update()` from the render loop on camera change — the canonical R3F mechanism; no bespoke hover tracking.

### 8.4 Alpha map attachment (D3 resolution)

Resolved as a two-level shape, with rationale:

- **`SpriteSheet.alphaMap?: AlphaMap`** — the asset-side carrier, exactly mirroring the shipped `SpriteSheet.normalMap?: Texture` precedent. The loader owns population (probe sidecar → decode → fallback), consistent with the loader-architecture doctrine (thin `three.Loader<T>` wrappers, no registries).
- **`Sprite2D.alphaMap?: AlphaMap`** — the instance-level slot `raycast()` actually reads, assigned automatically when a sprite is constructed from a sheet/frame, user-overridable.

Why not an ECS trait: events must work for standalone sprites ("Three.js first"), and standalone sprites have no ECS enrollment. The old ASSET-PRECOMPUTATION.md §4.5 coupling concern is answered by keeping `AlphaMap` a pure data class with no knowledge of hit-testing — the sheet carries it, the sprite consumes it, and nothing else knows it exists. If Phase 2 batched-picking acceleration ever wants ECS-side access, a trait can reference the same object behind the facade without public API change (operating principle 5).

## 9. Vanilla path

Plain `Raycaster`. The `examples/three/hit-test` example demonstrates `raycaster.setFromCamera` + `intersectObjects` + the `hitTestMode` API directly — no event library, no `EventDispatcher` ceremony, no `@pmndrs/pointer-events` (D4). Users who want DOM-like pointer events in vanilla three are pointed at the raycast contract; anything that consumes it works.

## 10. Baked alpha sidecar (D2)

The PoC's `AlphaMap.fromTexture()` canvas readback (~16 MB synchronous main-thread read for a 2048² atlas) becomes the **fallback**, not the design. The sidecar follows the normals pipeline verbatim:

```
assets/sprites.png          # source atlas
assets/sprites.atlas.json   # meta.sources[…], meta.normal: '…', meta.alpha: 'sprites.alpha.png'  ← new schema field
assets/sprites.normal.png   # existing baked sidecar
assets/sprites.alpha.png    # single-channel PNG, tEXt hash-stamped
```

- **Baker:** registered under `flatland.bake` (`{ name: 'alpha', … }`), reusing `writeSidecarPng`, `hashDescriptor`, and the descriptor-hash staleness model from `@three-flatland/normals`. Package home (inside `normals`, which already owns the alpha channel, vs a new package) is a plan-time call.
- **Schema:** `meta.alpha: string` added to both schema copies (`docs/public/schemas/atlas.v1.json`, `packages/schemas/src/atlas/schema.json`), following the `meta.normal` precedent; `atlas.types.gen.ts` regenerates.
- **Loader:** `SpriteSheetLoaderOptions.alpha?: boolean | AlphaOptions` parallel to the existing `normals` option. Resolution order: explicit `meta.alpha` URI → `bakedSiblingURL(source, '.alpha.png')` probe → runtime readback fallback with the standard devtime warning pointing at `flatland-bake alpha`. `forceRuntime` honored.
- **Runtime:** `AlphaMap` class harvested from the PoC — alpha-only `Uint8Array` (1 byte/pixel), Y-flip in `sampleAtlasUV`, frame-rect mapping in `sampleFrame` — all of which survives unchanged; only `fromTexture` demotes to fallback duty.

## 11. PoC defect ledger (regression tests required)

Every confirmed defect from the harvest review becomes a named regression test in the plan:

1. TileMap2D raycast must `return false` (child-traversal phantom hits).
2. World `point` must be per-hit and cloned (PoC shared a module-level `Vector3`; PoC SpriteBatch returned the batch-plane point for every instance — apparatus deleted, but the test guards the contract).
3. No duplicate intersections from one raycast call (plain three gets no dedup).
4. `'alpha'` mode honors anchor offsets (UV anchor math has two equivalent-looking formulas; pin with a non-default anchor test).
5. `'none'` mode: own-property null + prototype restoration round-trip.
6. Non-uniform scale: `'radius'` uses the conservative inscribed circle in _local_ space with scale carried by `matrixWorld` — pin behavior with an asymmetric-scale test.

## 12. Card-game showcase mapping (P4)

- `HitTester.pick(x, y) → Pickable` and `InputBridge` remain **showcase-level thin wrappers** consuming R3F pointer events, per the showcase spec's own D13/D14 simplification note. This spec supplies the library half: sprites and tilemaps that R3F can actually hit.
- **GPU ID-buffer picking stays Phase 2 of the showcase plan**, with `instanceExtras.y` remaining reserved (interleaved-buffer spec) and the same `pick()` signature — unchanged by this spec, enabled by it.

## 13. Out of scope (explicit, all tracked)

Deferred from this PR; each has a tracking issue so nothing is lost.

- **`FlatlandTexture`** render-to-texture portal (§8.2) — `createFlatlandCompute` ships; the component needs a render-target ownership story. → [#126](https://github.com/thejustinwalsh/three-flatland/issues/126).
- **Batched-sprite picking** (D1) — interactive once #85 makes batched sprites graph citizens. → [#127](https://github.com/thejustinwalsh/three-flatland/issues/127) (depends on #85). No interim code by design.
- **GPU ID-buffer picking** — high-instance Phase 2 path, same `pick()` signature; `instanceExtras.y` reserved. → [#128](https://github.com/thejustinwalsh/three-flatland/issues/128).
- **Drag helper** — _not blocked by anything_: we're on R3F v10 everywhere, so drag is already composable from the pointer events the raycast contract ships. A dedicated ergonomic helper is future scope. → [#129](https://github.com/thejustinwalsh/three-flatland/issues/129).
- **Skia node picking** (`SkPath::contains`) — needs the C export from **our** zig Skia WASM build (we own Skia end-to-end). → [#130](https://github.com/thejustinwalsh/three-flatland/issues/130).
- **`meta.alpha` atlas-schema discovery** — lands with the atlas schema work. → [#124](https://github.com/thejustinwalsh/three-flatland/issues/124).
- **Rotated/trimmed atlas frames** — not honored by the renderer (and so, consistently, not by alpha hit-testing); owned by the atlas overhaul in [PR #117](https://github.com/thejustinwalsh/three-flatland/pull/117), not this workstream.

## 14. Harvest manifest (from `d24fd704`)

| Artifact                                                      | Disposition                                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `planning/EVENT-SYSTEM.md` §2, §6, §7 rationale               | Carried into §3, §6, and §7.3 here                                                                                                         |
| `EVENT-SYSTEM.md` §3.1/§7 batch raycast + reverse lookup      | **Deleted from design** (§4)                                                                                                               |
| `events/HitTestMode.ts`                                       | Port as-is                                                                                                                                 |
| `events/AlphaMap.ts`                                          | Port; `fromTexture` demoted to fallback (§10)                                                                                              |
| `events/raycastHelpers.ts`                                    | Port with shared-`Vector3` fix (§11.2)                                                                                                     |
| `events/SpatialGrid.ts`                                       | Shelve as optional acceleration (§7.3) with documented fixes                                                                               |
| `Sprite2D`/`TileMap2D` raycast implementations                | Re-derive against current classes; algorithms carry, field access does not                                                                 |
| `react/uvCompute.ts`, `FlatlandTexture.tsx`                   | Harvest pattern; rebuild against current Flatland API (§8.1–8.2)                                                                           |
| `examples/{react,vanilla}/hit-test`                           | Rebuild as `examples/{react,three}/hit-test` per current pairing convention; vanilla example drops pointer-events for plain Raycaster (§9) |
| `docs examples/hit-test.mdx`                                  | Rewrite against the new examples                                                                                                           |
| `planning/ASSET-PRECOMPUTATION.md` (rode along in the commit) | §3.1/§5.2 alpha proposal realized as §10 here; rest already superseded by the shipped bake pipeline                                        |

## 15. Implementation slices (for the plan)

1. **Primitives:** `Sprite2D.raycast()` + hit modes, `TileMap2D.raycast()` + traversal fix + tile accessor, `HitTestMode`/`raycastHelpers` ports, §11 regression suite.
2. **R3F + Flatland:** portal compute for `<flatland>`, `FlatlandTexture`, `events.update()` wiring, `examples/three/hit-test` + `examples/react/hit-test`, docs page with the D1 limitation note.
3. **Alpha sidecar:** schema field + regen, baker, loader option, `AlphaMap` runtime + fallback.
4. **(With/after #85)** batched sprites become interactive for free; profile before reaching for `SpatialGrid`.
