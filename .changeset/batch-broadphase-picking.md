---
'three-flatland': minor
---

Batch-root broadphase picking. `SpriteBatch.raycast` now does a spatial-grid
broadphase over its sprites instead of being a no-op, so scene traversal
(`raycaster.intersectObjects(scene.children, true)`) finds batched sprites in
roughly constant time per click rather than not at all.

A uniform hash grid (`SpriteSpatialGrid`) holds each batch's `Sprite2D`
references keyed by world position, maintained where slots are assigned/moved/
freed. `raycast` intersects the ray with z=0, queries the covering cell, and
delegates each candidate to the sprite's own `raycast()` — reusing the per-sprite
hit-test and returning `intersection.object === sprite`. Pick cost stays ~flat
to 50k sprites in a shared-texture scene.

React (`three-flatland/react`) gets the same win. R3F raycasts every interactive
object in `state.internal.interaction` per pointer event — O(n) in sprite count.
When a batched sprite is R3F-managed, its picking is now proxied to the owning
batch: the sprite is spliced out of the interaction list (handlers preserved) and
the batch is registered once in its place. `<sprite2D onClick>` fires exactly as
before, with `event.object === sprite`, but a 3000-sprite shared-texture batch now
presents a single raycast target instead of 3000 — the interaction list holds one
object, not one per sprite. Vanilla (non-R3F) sprites are untouched.
