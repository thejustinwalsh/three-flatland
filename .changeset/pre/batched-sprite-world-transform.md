---
'three-flatland': patch
---

Fix rendering and pointer hit testing for sprites added via `flatland.add()`.

Batched sprites are composed into a `SpriteBatch` instance matrix from their
local transform, and their `matrixWorld` was never maintained — so a sprite
under a transformed `SpriteGroup` rendered at the wrong place, and
`raycaster.intersectObject(sprite)` (the one hit-test contract, per the
`hit-test` example) tested against an identity matrix and missed.

`transformSyncSystem` composes each sprite's world transform (folding the
group's 2D affine once per frame, identity-fast-pathed) into the instance slot.
It does NOT write `sprite.matrixWorld` per frame — rendering reads the slot, and
the only per-frame consumer of a batched sprite's matrixWorld is `raycast()`,
which composes it on demand for the one sprite being cast. `SpriteBatch.matrixWorld`
is pinned to identity so instances carry world exactly. `sceneGraphSyncSystem`'s prune is
gated to actual batch meshes so a `renderOrder`-demoted sprite is no longer
evicted from the graph. `Sprite2D`/`TileMap2D` `raycast()` refresh their world
matrix for casts issued outside the frame loop.

No API change — batched sprites now behave like `scene.add()` sprites under the
existing `Raycaster`/`onPointer*` idiom.
