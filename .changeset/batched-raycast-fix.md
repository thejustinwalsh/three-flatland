---
'three-flatland': patch
---

Fix pointer hit testing on objects added via `flatland.add()`.

`Flatland`'s internal scene disables `matrixWorldAutoUpdate` — matrices refresh
once per frame inside `render()` — so a raycast from user code read an identity
`matrixWorld`. `hitTestMode: 'radius'` then tested a 0.5-unit disc against a
sprite drawn at 150 units: only a dead-centre ray hit, and hover appeared dead
everywhere else.

`Sprite2D.raycast()` and `TileMap2D.raycast()` now refresh their own world
matrix first. Examples never hit this because they use `scene.add()` and plain
R3F children; batched objects were the untested path.
