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
