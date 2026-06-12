---
"three-flatland": minor
---

> Branch: worktree-events-system
> PR: https://github.com/thejustinwalsh/three-flatland/pull/125

### 6ef42b72356a33615296a0073adce1737af0b49f
fix: AnimatedSprite2D updates inherited alphaMap on sheet swap
CodeRabbit #125: the null-only guard left a sheet-inherited alphaMap stale
after swapping spritesheets. Track inherited vs user-set so swaps update the
inherited mask while preserving an explicit assignment.
Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
Stats: 2 files changed, 47 insertions(+), 1 deletion(-)

### 5a4f6853b2599ec68989f302a77a7225f716cb39
fix: empty supportedHitTestModes guard + resolveAlphaMap decode fallback
CodeRabbit #125: resolveHitTestMode could return undefined for an empty
supported list — now throws; a corrupt/stale baked .alpha.png rejected the
whole load — now caught and degraded to runtime extraction; test warn
assertion made NODE_ENV-deterministic.
Files: packages/three-flatland/src/events/HitTestMode.test.ts, packages/three-flatland/src/events/HitTestMode.ts, packages/three-flatland/src/events/resolveAlphaMap.test.ts, packages/three-flatland/src/events/resolveAlphaMap.ts
Stats: 4 files changed, 55 insertions(+), 18 deletions(-)

### 407074489eb41e31cd5347c2b23a0f8f33b0e0a5
fix: Sprite2D — flip-aware alpha sampling, clone hit-test config, explicit none guard
CodeRabbit #125: alpha mode sampled the unflipped atlas (mirrored sprites
hit-tested the wrong pixels) — now mirrors Sprite2DMaterial's UV flip;
clone() dropped hitTestMode/hitRadius/alphaThreshold/alphaMap — now carried;
added an explicit 'none' early-return in raycast() for direct calls (the
raycast-nulling stays as the R3F-registration skip optimization).
Files: packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
Stats: 2 files changed, 66 insertions(+), 2 deletions(-)

### 61bcf0b0cfc02c270930bea2b99c2acc87140140
refactor: break AlphaMap <-> sprites/types type cycle
AlphaMap imported SpriteFrame from sprites/types while SpriteSheet.alphaMap
imported AlphaMap back — a type-only cycle (no runtime effect, but real in
the type graph). Give sampleFrame a local structural AtlasRect type so
events/ never imports sprites/. Not the cause of the DTS-build heap pressure
(that persists with the cycle gone — it's the package's type-graph size vs
the default DTS worker heap), but correct hygiene.
Files: packages/three-flatland/src/events/AlphaMap.ts
Stats: 1 file changed, 14 insertions(+), 2 deletions(-)

### 2e0d613acc3b1f39ecfc65a2b5b1755d1d346fe1
fix: key the spritesheet cache on sidecar flags (alpha/normals/forceRuntime)
Final-review finding: getCacheKey hashed only URL + texture preset, so
load(url, { alpha: true }) and a bare load(url) shared a cache entry —
whichever resolved first won, silently giving the alpha caller a sheet
with no alphaMap (degrading hitTestMode 'alpha' to bounds). Fold the
sidecar flags into the cache identity.
Files: packages/three-flatland/src/loaders/SpriteSheetLoader.test.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts
Stats: 2 files changed, 21 insertions(+), 1 deletion(-)

### 3673d47a4a1655dba76e82f5597eec98e987e62d
feat: AnimatedSprite2D adopts SpriteSheet.alphaMap
Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
Stats: 2 files changed, 39 insertions(+), 7 deletions(-)

### 1c815f291b6fe71895f8b283959a29a4c9501d00
feat: alpha option populating SpriteSheet.alphaMap via sidecar resolve
Files: packages/three-flatland/src/loaders/SpriteSheetLoader.test.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/sprites/types.ts
Stats: 3 files changed, 104 insertions(+), 10 deletions(-)

### add6a9a3140a7998087ad73d37f883f917a15f98
feat: resolveAlphaMap with baked-sidecar probe and runtime fallback
Files: packages/three-flatland/src/events/index.ts, packages/three-flatland/src/events/resolveAlphaMap.test.ts, packages/three-flatland/src/events/resolveAlphaMap.ts
Stats: 3 files changed, 129 insertions(+)

### 582b062ed76faf32d864903bad89dd5df380dd17
feat: createFlatlandCompute portal events seam for flatland camera
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/react/flatlandEvents.test.ts, packages/three-flatland/src/react/flatlandEvents.ts, packages/three-flatland/src/react/index.ts
Stats: 4 files changed, 88 insertions(+), 2 deletions(-)

### 605935e17dff298a10892b030a26be73b9eccc41
feat: TileMap2D raycast with O(1) tile lookup and child-traversal block
Files: packages/three-flatland/src/tilemap/TileMap2D.raycast.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 2 files changed, 151 insertions(+), 7 deletions(-)

### e89e37ccfa4c3bd1f2964605fa9228610f40859b
feat: Sprite2D.raycast with radius/bounds/alpha modes and none opt-out
Files: packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
Stats: 2 files changed, 271 insertions(+), 13 deletions(-)

### 312486dce60c249214a80201d69d32a67cdfbc31
feat: export events module + react subpath wrapper
Files: packages/three-flatland/package.json, packages/three-flatland/src/events/HitTestMode.ts, packages/three-flatland/src/events/index.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/react/events/index.ts
Stats: 5 files changed, 35 insertions(+)

### 9a6d9b7ca6cbb6c987531dcf832c285491e308db
feat: AlphaMap CPU alpha store with frame-rect sampling
Files: packages/three-flatland/src/events/AlphaMap.test.ts, packages/three-flatland/src/events/AlphaMap.ts
Stats: 2 files changed, 101 insertions(+)

### d3483e8dc2a29268cda39bf596adfbafba34cefa
feat: ray-to-local-plane helpers with per-hit point cloning
Files: packages/three-flatland/src/events/raycastHelpers.test.ts, packages/three-flatland/src/events/raycastHelpers.ts
Stats: 2 files changed, 117 insertions(+)

### 4ffe61342f0b8327c7ff9bd854effc6ad056f0d1
feat: hit-test mode union with resolve fallback
Files: packages/three-flatland/src/events/HitTestMode.test.ts, packages/three-flatland/src/events/HitTestMode.ts
Stats: 2 files changed, 50 insertions(+)
