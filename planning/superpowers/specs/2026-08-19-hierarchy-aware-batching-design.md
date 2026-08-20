# Hierarchy-aware batching design

## Scope

Make the source three.js hierarchy authoritative after a `Sprite2D` is promoted into a batch. This closes the implementation and proof gaps spanning orchestration issue #85, React Activity issue #213, and rectangular clipping issue #214.

## Required behavior

- A batched sprite composes its full world matrix from its authored `Object3D` ancestors.
- Authored visibility remains separate from the batcher's private suppression of the source mesh.
- A hidden sprite or ancestor emits no pixels and cannot be picked, then restores without remounting or losing its batch slot.
- Descendant sprites added through ordinary `Group` nodes remain in that source hierarchy while the owning `SpriteGroup` enrolls them.
- Shared ancestor paths are compared once per frame, and only slots beneath a changed ancestor are uploaded.
- Moving the shared `SpriteGroup` draw root updates the batch mesh and world-space picking data without rewriting unchanged relative instance matrices.
- `SpriteGroup.clipRect` accepts local `[x, y, width, height]` coordinates, follows the group's world transform, composes when nested, and applies to GPU rendering and CPU picking.
- Static groups honor `invalidateTransforms()`; newly assigned slots and direct sprite visibility writes invalidate automatically.

## Rendering model

`SpriteBatch` inherits its owning `SpriteGroup` transform. The transform system retains each source sprite's complete world matrix for picking and debugging, then writes `inverse(drawRoot.matrixWorld) * source.matrixWorld` into its instance slot. Hidden hierarchy entries retain their relative translation and homogeneous component but receive a zero linear transform, producing degenerate geometry without reallocating or re-sorting the slot.

A shared hierarchy tracker snapshots local matrices, parent identity, and effective visibility for each observed `Object3D`. Shared ancestors are compared once per frame. A source slot is uploaded only when its path changes. Draw-root-only changes recompute world-space picking data and compare the root-relative record, so transform-only root motion produces no instance upload while root visibility changes still do.

`SpriteGroup` derives from Three.js `ClippingGroup`. Four local rectangle planes are transformed into world planes before traversal. `Sprite2DMaterial` keeps clipping in the fragment stage because Three.js hardware clip distances are evaluated before the synthesized instanced quad position is reliable.

## React integration

React 19 `Activity` controls an ordinary host group's `visible` state. Because the retained source hierarchy is consulted every transform pass, Activity can hide and restore a subtree without mutating internal batch suppression or forcing remounts.

## Compatibility

This is a breaking behavioral correction. Code that compensated for flattened parent transforms or manually mirrored parent visibility may need those workarounds removed. The release commit must use `fix(core)!` and include a `BREAKING CHANGE:` footer so the automatic changeset generator records the break.

## Proof

- Unit coverage for automatic orchestration, nested parent transforms, hierarchy visibility, static invalidation, transformed and nested clipping, and picking.
- A real React reconciler test that cycles `Activity` between hidden and visible states.
- Paired Three.js and React examples rendered through WebGPU.
- The 16,384-sprite schedule micro-benchmark passes the existing ±10% gate: median all-moving time is 7.27 ms versus `main` at 6.78 ms (+7.3%); median static time is 5.35 ms versus 6.56 ms (-18.4%). Measurements use identical five-sample, 20-frame workloads in the same local Vitest/Node environment.
- The 100,000-sprite bulk stress produces seven 16,384-slot batches with all 100,000 instances active. Compared with `main` under identical one-process probes, initialization is 1,581 ms versus 1,515 ms (+4.4%), heap growth is 1,008 MiB versus 979 MiB (+3.0%), and RSS growth is 1,163 MiB versus 1,108 MiB (+5.0%).
- A deterministic live React Knightmark run with WebGPU and 40,010 animated sprites remains frame-rate neutral: 22.92 FPS on this branch versus 22.82 FPS on `main` (+0.4%) in back-to-back five-second samples. The `transformSync` measure is 17.42 ms versus 16.31 ms (+6.8%), within the existing ±10% gate; direct-root sprites use an identity fast path and do not multiply their local matrix by the draw root.
- Package, docs, examples, and mini builds plus an adversarial Claude review before publication.
