---
"three-flatland": minor
---

> Branch: worktree-events-system
> PR: https://github.com/thejustinwalsh/three-flatland/pull/125

### 68fcbdf27396059dca8296c02ab23efd0bc7cc69
fix: AnimatedSprite2D keeps a user-set alphaMap across sheet swaps
The spriteSheet setter decided whether to replace alphaMap from the
_usesSpriteSheetAlphaMap flag, but that flag only tracks the sheet path
— assigning the public alphaMap property directly leaves it stale at
true. So inherit-from-sheet → user override → swap clobbered the user's
map. Decide replacement by comparing the current alphaMap against the
previous sheet's inherited map instead: replace only when alphaMap is
null or still that inherited map. Add a regression test for the
inherit → override → swap lifecycle (the existing user-set test never
inherited first, so it missed the stale-flag path).
Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
Stats: 2 files changed, 34 insertions(+), 1 deletion(-)

### 024cb610d30e1683e400c1d2962b22348590c15d
fix: AnimatedSprite2D updates inherited alphaMap on sheet swap
CodeRabbit #125: the null-only guard left a sheet-inherited alphaMap stale
after swapping spritesheets. Track inherited vs user-set so swaps update the
inherited mask while preserving an explicit assignment.
Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
Stats: 2 files changed, 47 insertions(+), 1 deletion(-)

### a9209ed2ff60f71d021f3a9792fbd3602c276bee
fix: empty supportedHitTestModes guard + resolveAlphaMap decode fallback
CodeRabbit #125: resolveHitTestMode could return undefined for an empty
supported list — now throws; a corrupt/stale baked .alpha.png rejected the
whole load — now caught and degraded to runtime extraction; test warn
assertion made NODE_ENV-deterministic.
Files: packages/three-flatland/src/events/HitTestMode.test.ts, packages/three-flatland/src/events/HitTestMode.ts, packages/three-flatland/src/events/resolveAlphaMap.test.ts, packages/three-flatland/src/events/resolveAlphaMap.ts
Stats: 4 files changed, 55 insertions(+), 18 deletions(-)

### 34c039f1a94e4384c223a8b1ae60a2297e92eea6
fix: Sprite2D — flip-aware alpha sampling, clone hit-test config, explicit none guard
CodeRabbit #125: alpha mode sampled the unflipped atlas (mirrored sprites
hit-tested the wrong pixels) — now mirrors Sprite2DMaterial's UV flip;
clone() dropped hitTestMode/hitRadius/alphaThreshold/alphaMap — now carried;
added an explicit 'none' early-return in raycast() for direct calls (the
raycast-nulling stays as the R3F-registration skip optimization).
Files: packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
Stats: 2 files changed, 66 insertions(+), 2 deletions(-)

### 46efe52a759e55bca8bac07c3d714a92f9ecca56
refactor: break AlphaMap <-> sprites/types type cycle
AlphaMap imported SpriteFrame from sprites/types while SpriteSheet.alphaMap
imported AlphaMap back — a type-only cycle (no runtime effect, but real in
the type graph). Give sampleFrame a local structural AtlasRect type so
events/ never imports sprites/. Not the cause of the DTS-build heap pressure
(that persists with the cycle gone — it's the package's type-graph size vs
the default DTS worker heap), but correct hygiene.
Files: packages/three-flatland/src/events/AlphaMap.ts
Stats: 1 file changed, 14 insertions(+), 2 deletions(-)

### c67a9695449d412b0008da24b95684c0a156df1c
fix: key the spritesheet cache on sidecar flags (alpha/normals/forceRuntime)
Final-review finding: getCacheKey hashed only URL + texture preset, so
load(url, { alpha: true }) and a bare load(url) shared a cache entry —
whichever resolved first won, silently giving the alpha caller a sheet
with no alphaMap (degrading hitTestMode 'alpha' to bounds). Fold the
sidecar flags into the cache identity.
Files: packages/three-flatland/src/loaders/SpriteSheetLoader.test.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts
Stats: 2 files changed, 21 insertions(+), 1 deletion(-)

### b42b74ee5b6e8a546dddc47002802f4afd27174d
feat: AnimatedSprite2D adopts SpriteSheet.alphaMap
Files: packages/three-flatland/src/sprites/AnimatedSprite2D.test.ts, packages/three-flatland/src/sprites/AnimatedSprite2D.ts
Stats: 2 files changed, 39 insertions(+), 7 deletions(-)

### 341ebeb22e9eefaf1ae9a919acb53c4e9345ed61
feat: alpha option populating SpriteSheet.alphaMap via sidecar resolve
Files: packages/three-flatland/src/loaders/SpriteSheetLoader.test.ts, packages/three-flatland/src/loaders/SpriteSheetLoader.ts, packages/three-flatland/src/sprites/types.ts
Stats: 3 files changed, 104 insertions(+), 10 deletions(-)

### f7115882e8ed985ebc7734519c0d4e2cacf4d0e0
feat: resolveAlphaMap with baked-sidecar probe and runtime fallback
Files: packages/three-flatland/src/events/index.ts, packages/three-flatland/src/events/resolveAlphaMap.test.ts, packages/three-flatland/src/events/resolveAlphaMap.ts
Stats: 3 files changed, 129 insertions(+)

### b42d30032bc24367b6fdcb0c7993cb381fd8abd7
feat: createFlatlandCompute portal events seam for flatland camera
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/react/flatlandEvents.test.ts, packages/three-flatland/src/react/flatlandEvents.ts, packages/three-flatland/src/react/index.ts
Stats: 4 files changed, 88 insertions(+), 2 deletions(-)

### fba088a29a2895c7c8614b1991136f5f72c12b92
feat: TileMap2D raycast with O(1) tile lookup and child-traversal block
Files: packages/three-flatland/src/tilemap/TileMap2D.raycast.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 2 files changed, 151 insertions(+), 7 deletions(-)

### b7ff64f3ca3cc646e19db7d5a66285ba10e67efa
feat: Sprite2D.raycast with radius/bounds/alpha modes and none opt-out
Files: packages/three-flatland/src/sprites/Sprite2D.raycast.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
Stats: 2 files changed, 271 insertions(+), 13 deletions(-)

### a172d41ce3f865d7f1c311095ade3dc26c0ce6b5
feat: export events module + react subpath wrapper
Files: packages/three-flatland/package.json, packages/three-flatland/src/events/HitTestMode.ts, packages/three-flatland/src/events/index.ts, packages/three-flatland/src/index.ts, packages/three-flatland/src/react/events/index.ts
Stats: 5 files changed, 35 insertions(+)

### 5d49506fcd75ed23e5d959d92008e20a502b576a
feat: AlphaMap CPU alpha store with frame-rect sampling
Files: packages/three-flatland/src/events/AlphaMap.test.ts, packages/three-flatland/src/events/AlphaMap.ts
Stats: 2 files changed, 101 insertions(+)

### 86260c6e2e8ede3c46042254897602c59fb20eda
feat: ray-to-local-plane helpers with per-hit point cloning
Files: packages/three-flatland/src/events/raycastHelpers.test.ts, packages/three-flatland/src/events/raycastHelpers.ts
Stats: 2 files changed, 117 insertions(+)

### ea9bca8a343587ee0f4e99c9af5fa49a8dfcd29d
feat: hit-test mode union with resolve fallback
Files: packages/three-flatland/src/events/HitTestMode.test.ts, packages/three-flatland/src/events/HitTestMode.ts
Stats: 2 files changed, 50 insertions(+)
