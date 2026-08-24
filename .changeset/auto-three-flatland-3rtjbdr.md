---
"three-flatland": minor
---

> Branch: feat/internal-ecs-release-stack

### b153a583b08109938057c8d9065edc5e7ba435d9
fix: seal private ECS API boundary
Files: packages/three-flatland/package.json, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/batchUtils.test.ts, packages/three-flatland/src/ecs/index.ts, packages/three-flatland/src/ecs/systems/batchAssignSystem.ts, packages/three-flatland/src/ecs/systems/batchSort.test.ts, packages/three-flatland/src/ecs/systems/defaultMaterials.test.ts, packages/three-flatland/src/ecs/systems/effectFieldHotPath.test.ts, packages/three-flatland/src/ecs/systems/entityLifecycle.test.ts, packages/three-flatland/src/ecs/systems/lightEffectSystem.test.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.test.ts, packages/three-flatland/src/ecs/systems/sortFlash.test.ts, packages/three-flatland/src/ecs/systems/sortLayerRouting.test.ts, packages/three-flatland/src/ecs/systems/transformSyncSystem.ts, packages/three-flatland/src/ecs/testUtils.type-test.ts, packages/three-flatland/src/ecs/traits.test.ts, packages/three-flatland/src/ecs/world.test.ts, packages/three-flatland/src/ecs/world.ts, packages/three-flatland/src/events/hierarchyBatching.test.ts, packages/three-flatland/src/expected-sprites.test.ts, packages/three-flatland/src/flatland-effect-ownership.test.ts, packages/three-flatland/src/flatland-material-ownership.test.ts, packages/three-flatland/src/internal/batch-query-builder.ts, packages/three-flatland/src/internal/ecs-handles.ts, packages/three-flatland/src/internal/effect-runtime.ts, packages/three-flatland/src/internal/public-api-boundary.test-d.ts, packages/three-flatland/src/internal/sprite-group-runtime.ts, packages/three-flatland/src/internal/sprite-runtime.ts, packages/three-flatland/src/lights/LightEffect.test.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/loaders/texturePacker.test.ts, packages/three-flatland/src/materials/MaterialEffect.batch.test.ts, packages/three-flatland/src/materials/MaterialEffect.test.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/orchestration/autoBatch.test.ts, packages/three-flatland/src/orchestration/orchestrator.test.ts, packages/three-flatland/src/orchestration/orchestrator.ts, packages/three-flatland/src/orchestration/registry.test.ts, packages/three-flatland/src/orchestration/registry.ts, packages/three-flatland/src/pipeline/PassEffect.ts, packages/three-flatland/src/pipeline/SpriteGroup.test.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/pipeline/batchQuery.test.ts, packages/three-flatland/src/pipeline/batchQuery.ts, packages/three-flatland/src/pipeline/tightMesh.test.ts, packages/three-flatland/src/react/activity.test.tsx, packages/three-flatland/src/react/types.ts, packages/three-flatland/src/shadow-pipeline.test.ts, packages/three-flatland/src/sprites/Sprite2D.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts, tools/ecs-bench/src/declaration-boundary.test.ts, tools/ecs-bench/src/expected-sprites.ts, tools/ecs-bench/src/renderer-evidence.ts
Stats: 53 files changed, 973 insertions(+), 721 deletions(-)

### 7faf7f400a20741f9686bd15a3e9a0652c4c15fd
fix: snapshot effect projection targets
Files: packages/three-flatland/src/tilemap/TileMap2D.effects.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 2 files changed, 61 insertions(+), 4 deletions(-)

### ee6e7c131a9578ef8ff1f57783c03986df4ea3c5
fix: guard projection reentrancy
Files: packages/three-flatland/src/internal/tile-layer-operations.ts, packages/three-flatland/src/tilemap/TileLayer.ts, packages/three-flatland/src/tilemap/TileMap2D.effects.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 4 files changed, 197 insertions(+), 51 deletions(-)

### 1546684947d6705287fe0d518ae0f1b4f6a0bfc2
fix: release effect projection scratch
Files: packages/three-flatland/src/internal/tile-layer-operations.ts, packages/three-flatland/src/tilemap/TileLayer.ts, packages/three-flatland/src/tilemap/TileMap2D.effects.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 4 files changed, 50 insertions(+), 2 deletions(-)

### 7289a6e70b9d09f10eb86cef646a7f55545505b5
fix: make material lifecycle ownership-safe
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/flatland-material-ownership.test.ts, packages/three-flatland/src/internal/flatland-material-state.ts, packages/three-flatland/src/internal/ownership-observers.ts, packages/three-flatland/src/internal/terminal-object.test-d.ts, packages/three-flatland/src/internal/terminal-object.ts, packages/three-flatland/src/internal/tile-effect-overrides.ts, packages/three-flatland/src/internal/tile-layer-operations.ts, packages/three-flatland/src/internal/tile-layer-ownership.ts, packages/three-flatland/src/internal/tile-map-effect-projection.ts, packages/three-flatland/src/internal/tile-material-retirement.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/tilemap/TileLayer.ts, packages/three-flatland/src/tilemap/TileMap2D.effects.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 16 files changed, 2491 insertions(+), 263 deletions(-)

### 223ebf7a2d46d7409bb8d2f4eff6fbc285da7e5e
perf: recover runtime size headroom
Files: packages/three-flatland/src/ecs/runtime/capacity.test.ts, packages/three-flatland/src/ecs/runtime/sparse-set.test.ts, packages/three-flatland/src/ecs/runtime/sparse-set.ts, packages/three-flatland/src/ecs/runtime/trait.ts, packages/three-flatland/src/ecs/runtime/world.ts, packages/three-flatland/src/internal/reserved-world.ts
Stats: 6 files changed, 36 insertions(+), 47 deletions(-)

### 87021bdad10ac9033090664152ad8f630c69149c
fix: close terminal lifecycle gaps
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/flatland-material-ownership.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/tilemap/TileLayer.ts, packages/three-flatland/src/tilemap/TileMap2D.effects.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 6 files changed, 327 insertions(+), 27 deletions(-)

### 23eba045a0acfe2818f1dcc2e8482025086aa9db
fix: guard world capacity reservation
Files: packages/three-flatland/src/ecs/runtime/capacity.test.ts, packages/three-flatland/src/ecs/runtime/world.ts
Stats: 2 files changed, 46 insertions(+)

### 11b06cb93c74c271720484aecada838aaab54107
fix: make disposal terminal and first-error-safe
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/flatland-material-ownership.test.ts, packages/three-flatland/src/tilemap/TileMap2D.effects.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 4 files changed, 191 insertions(+), 20 deletions(-)

### 49c19c8ad86f8f897d55be53fc0fa10f797f82c1
fix: make projection rebuilds transactional
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/flatland-material-ownership.test.ts, packages/three-flatland/src/tilemap/TileLayer.ts, packages/three-flatland/src/tilemap/TileMap2D.effects.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 5 files changed, 203 insertions(+), 34 deletions(-)

### 3a051129fe05da9442dcaac358993e9930830915
fix: preserve owners on rejected reparent
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/flatland-material-ownership.test.ts
Stats: 2 files changed, 68 insertions(+), 4 deletions(-)

### 6c84295cac79ae993afd818994188e1b35892197
perf: enforce shipped ECS size budget
Files: packages/three-flatland/src/ecs/runtime/capacity.test.ts, packages/three-flatland/src/ecs/runtime/entity.ts, packages/three-flatland/src/ecs/runtime/error.ts, packages/three-flatland/src/ecs/runtime/selector.ts, packages/three-flatland/src/ecs/runtime/sparse-set.ts, packages/three-flatland/src/ecs/runtime/trait.ts, packages/three-flatland/src/ecs/runtime/world.ts, packages/three-flatland/src/internal/capacity.ts, packages/three-flatland/src/internal/reserved-world.ts, tools/ecs-bench/src/evidence-integrity.test.ts, tools/ecs-bench/src/fixtures/flatland-shipped-runtime-size-entry.ts, tools/ecs-bench/src/measure-kernels-size.ts
Stats: 12 files changed, 99 insertions(+), 114 deletions(-)

### 7308c9b9e3e12660c6c0ed0c45c03732e293f20f
fix: release Flatland ownership on sprite dispose
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/flatland-material-ownership.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
Stats: 3 files changed, 78 insertions(+)

### 849b5e7f535a4b03b4fd78481db741da55edac48
refactor: remove Koota peer dependency
Files: docs/package.json, packages/three-flatland/package.json, packages/three-flatland/tsdown.config.ts, pnpm-lock.yaml
Stats: 4 files changed, 1 insertion(+), 9 deletions(-)

### a4f2ef25302aa183b21ed4ab967308c354eb24c0
perf: isolate advisory capacity reservation
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/runtime/capacity.test.ts, packages/three-flatland/src/ecs/runtime/entity.ts, packages/three-flatland/src/ecs/runtime/index.ts, packages/three-flatland/src/ecs/runtime/sparse-set.ts, packages/three-flatland/src/ecs/runtime/world.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/expected-sprites.test.ts, packages/three-flatland/src/internal/capacity.ts, packages/three-flatland/src/internal/reserved-world.ts, packages/three-flatland/src/pipeline/SpriteGroup.test-d.ts, packages/three-flatland/src/pipeline/SpriteGroup.test.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/pipeline/types.ts, packages/three-flatland/src/sprites/Sprite2D.ts, planning/internal-ecs/06-private-ecs-architecture-standard.md, planning/internal-ecs/07-private-ecs-convergence-plan.md, planning/internal-ecs/results/kernel-baseline.json, planning/internal-ecs/results/kernel-size.json, tools/ecs-bench/src/expected-sprites.ts, tools/ecs-bench/src/fixtures/flatland-capacity-size-entry.ts, tools/ecs-bench/src/measure-kernels-size.ts
Stats: 23 files changed, 2540 insertions(+), 2610 deletions(-)

### 2a3e8b70fbbd29e82b1d83bbc39b9fc1c8506a02
feat: add advisory sprite capacity hints
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/runtime/capacity.test.ts, packages/three-flatland/src/ecs/runtime/entity.ts, packages/three-flatland/src/ecs/runtime/index.ts, packages/three-flatland/src/ecs/runtime/sparse-set.ts, packages/three-flatland/src/ecs/runtime/world.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/expected-sprites.test.ts, packages/three-flatland/src/internal/capacity.ts, packages/three-flatland/src/pipeline/SpriteGroup.test-d.ts, packages/three-flatland/src/pipeline/SpriteGroup.test.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/pipeline/types.ts, tools/ecs-bench/package.json, tools/ecs-bench/src/expected-sprites.ts
Stats: 16 files changed, 775 insertions(+), 68 deletions(-)

### beec9dc18c570c9dc125636dd959ea93e5be005b
fix: reconcile live material ownership
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/flatland-material-ownership.test.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/react/attach.test.ts, packages/three-flatland/src/react/attach.ts, packages/three-flatland/src/sprites/Sprite2D.ts, packages/three-flatland/src/tilemap/TileLayer.ts, packages/three-flatland/src/tilemap/TileMap2D.effects.test.ts, packages/three-flatland/src/tilemap/TileMap2D.raycast.test.ts, packages/three-flatland/src/tilemap/TileMap2D.ts
Stats: 10 files changed, 1059 insertions(+), 87 deletions(-)

### 0e427666d61b81cf6a2d5b7ff8850b89f22287b7
fix: harden migrated ECS lifecycle
BREAKING CHANGE: SpriteBatch allocateSlot/freeSlot ownership APIs are now private, and numeric sort layers must be finite signed 32-bit integers.
Files: packages/three-flatland/package.json, packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/ecs/SystemSchedule.test.ts, packages/three-flatland/src/ecs/SystemSchedule.ts, packages/three-flatland/src/ecs/batchUtils.test.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/index.ts, packages/three-flatland/src/ecs/runtime/trait.ts, packages/three-flatland/src/ecs/runtime/world.ts, packages/three-flatland/src/ecs/systems/batchAssignSystem.ts, packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/ecs/systems/batchRemoveSystem.ts, packages/three-flatland/src/ecs/systems/batchSort.test.ts, packages/three-flatland/src/ecs/systems/batchSortSystem.ts, packages/three-flatland/src/ecs/systems/defaultMaterials.test.ts, packages/three-flatland/src/ecs/systems/effectFieldHotPath.test.ts, packages/three-flatland/src/ecs/systems/effectTraitsSystem.ts, packages/three-flatland/src/ecs/systems/entityLifecycle.test.ts, packages/three-flatland/src/ecs/systems/hotPathContract.test.ts, packages/three-flatland/src/ecs/systems/index.ts, packages/three-flatland/src/ecs/systems/lightEffectSystem.test.ts, packages/three-flatland/src/ecs/systems/lightEffectSystem.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.test.ts, packages/three-flatland/src/ecs/systems/sceneGraphSyncSystem.ts, packages/three-flatland/src/ecs/systems/sortLayerRouting.test.ts, packages/three-flatland/src/ecs/systems/transformSyncSystem.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/events/hierarchyBatching.test.ts, packages/three-flatland/src/flatland-effect-ownership.test.ts, packages/three-flatland/src/internal/effectSchemaValidation.ts, packages/three-flatland/src/internal/max-batch-size.ts, packages/three-flatland/src/internal/sprite-batch-ownership.ts, packages/three-flatland/src/lights/LightEffect.test.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/materials/EffectMaterial.ts, packages/three-flatland/src/materials/MaterialEffect.batch.test.ts, packages/three-flatland/src/materials/MaterialEffect.test-d.ts, packages/three-flatland/src/materials/MaterialEffect.test.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/materials/Sprite2DMaterial.ts, packages/three-flatland/src/materials/effectFlagBits.ts, packages/three-flatland/src/pipeline/PassEffect.ts, packages/three-flatland/src/pipeline/SpriteBatch.test-d.ts, packages/three-flatland/src/pipeline/SpriteBatch.test.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts, packages/three-flatland/src/pipeline/SpriteGroup.test.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/pipeline/batchQuery.test.ts, packages/three-flatland/src/pipeline/batchQuery.ts, packages/three-flatland/src/pipeline/sortLayers.ts, packages/three-flatland/src/pipeline/tightMesh.test.ts, packages/three-flatland/src/pipeline/types.ts, packages/three-flatland/src/react/attach.test.ts, packages/three-flatland/src/react/batchPicking.test.ts, packages/three-flatland/src/react/batchPicking.ts, packages/three-flatland/src/sprites/Sprite2D.ts, scripts/verify-public-declaration-boundary.mjs
Stats: 57 files changed, 6201 insertions(+), 1249 deletions(-)

### 8488eb0650be6fe3e404929ef4f1e62af3842eb5
fix: track pointer-specific missed hits
Files: packages/three-flatland/src/react/batchPicking.test.ts, packages/three-flatland/src/react/batchPicking.ts
Stats: 2 files changed, 20 insertions(+), 7 deletions(-)

### 138edfbced726b8f7b5ed23add315e73521279d8
fix: detach unused material hooks
Files: packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/systems/entityLifecycle.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
Stats: 3 files changed, 92 insertions(+), 25 deletions(-)

### 085e1623fe6a52441ddfb08b9287859720fa1d7b
fix: isolate picking store failures
Files: packages/three-flatland/src/events/hierarchyBatching.test.ts, packages/three-flatland/src/react/batchPicking.test.ts, packages/three-flatland/src/react/batchPicking.ts
Stats: 3 files changed, 100 insertions(+), 11 deletions(-)

### 1648aa6326e4af52c0a9deece3b7cad4527e4937
fix: rebuild sprite schema on material assignment
Files: packages/three-flatland/src/ecs/systems/sortLayerRouting.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts
Stats: 2 files changed, 51 insertions(+), 12 deletions(-)

### 0c019600288fbb2dc433700afb4cad46cc07764e
fix: release retired material references
Files: packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/ecs/systems/entityLifecycle.test.ts
Stats: 3 files changed, 32 insertions(+), 19 deletions(-)

### 4f18b59fcf84a7b9990753b6976fe983784f96fd
fix: harden batch ownership transitions
Files: packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/snapshot.ts, packages/three-flatland/src/ecs/systems/batchAssignSystem.ts, packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/ecs/systems/batchRemoveSystem.ts, packages/three-flatland/src/ecs/systems/batchSortSystem.ts, packages/three-flatland/src/ecs/systems/entityLifecycle.test.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.test.ts, packages/three-flatland/src/ecs/systems/sortLayerRouting.test.ts, packages/three-flatland/src/ecs/systems/transformSyncSystem.ts, packages/three-flatland/src/pipeline/SpriteBatch.test.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts, packages/three-flatland/src/sprites/Sprite2D.ts
Stats: 13 files changed, 299 insertions(+), 156 deletions(-)

### 8c4665ef51aeb7081d4109ce7228d957a41d891b
fix: preserve picking on failed reassign
Files: packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/events/hierarchyBatching.test.ts
Stats: 2 files changed, 45 insertions(+), 1 deletion(-)

### 5f75009e172855efb5fb785d0805a56cc4de13c2
perf: preserve stable batch traversal
Files: packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/ecs/systems/batchSortSystem.ts, packages/three-flatland/src/ecs/systems/transformSyncSystem.ts, packages/three-flatland/src/pipeline/SpriteBatch.test.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts
Stats: 5 files changed, 190 insertions(+), 56 deletions(-)

### 4c3d05f1f3295367bc0482d4145b1ca5bdc88851
perf: migrate batching to private ecs
Replace Koota world operations, relation routing, and global sprite traversal with the private typed runtime and batch-owned slot maps. Preserve the accidental public ECS members as opaque handles instead of leaking the private runtime.

BREAKING CHANGE: public members that previously exposed Koota World, Entity, and Trait types now expose opaque Flatland handles. Consumers must not use these implementation details for direct ECS access.
Files: packages/three-flatland/src/Flatland.ts, packages/three-flatland/src/debug/BatchCollector.ts, packages/three-flatland/src/debug/DevtoolsProvider.ts, packages/three-flatland/src/debug/debug-sink.ts, packages/three-flatland/src/debug/perf-track.ts, packages/three-flatland/src/ecs/SystemSchedule.test.ts, packages/three-flatland/src/ecs/SystemSchedule.ts, packages/three-flatland/src/ecs/batchUtils.test.ts, packages/three-flatland/src/ecs/batchUtils.ts, packages/three-flatland/src/ecs/index.ts, packages/three-flatland/src/ecs/runtime/entity.ts, packages/three-flatland/src/ecs/runtime/index.ts, packages/three-flatland/src/ecs/runtime/trait.ts, packages/three-flatland/src/ecs/runtime/world.ts, packages/three-flatland/src/ecs/snapshot.ts, packages/three-flatland/src/ecs/systems/batchAssignSystem.ts, packages/three-flatland/src/ecs/systems/batchReassignSystem.ts, packages/three-flatland/src/ecs/systems/batchRemoveSystem.ts, packages/three-flatland/src/ecs/systems/batchSort.test.ts, packages/three-flatland/src/ecs/systems/batchSortSystem.ts, packages/three-flatland/src/ecs/systems/conditionalTransformSyncSystem.ts, packages/three-flatland/src/ecs/systems/defaultMaterials.test.ts, packages/three-flatland/src/ecs/systems/effectTraitsSystem.ts, packages/three-flatland/src/ecs/systems/entityLifecycle.test.ts, packages/three-flatland/src/ecs/systems/flushDirtyRangesSystem.ts, packages/three-flatland/src/ecs/systems/lightEffectSystem.ts, packages/three-flatland/src/ecs/systems/lightMaterialAssignSystem.ts, packages/three-flatland/src/ecs/systems/lightSyncSystem.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.test.ts, packages/three-flatland/src/ecs/systems/materialVersionSystem.ts, packages/three-flatland/src/ecs/systems/postPassSystem.ts, packages/three-flatland/src/ecs/systems/sceneGraphSyncSystem.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.test.ts, packages/three-flatland/src/ecs/systems/shadowPipelineSystem.ts, packages/three-flatland/src/ecs/systems/sortFlash.test.ts, packages/three-flatland/src/ecs/systems/sortLayerRouting.test.ts, packages/three-flatland/src/ecs/systems/transformSyncSystem.ts, packages/three-flatland/src/ecs/testUtils.type-test.ts, packages/three-flatland/src/ecs/traits.test.ts, packages/three-flatland/src/ecs/traits.ts, packages/three-flatland/src/ecs/world.test.ts, packages/three-flatland/src/ecs/world.ts, packages/three-flatland/src/events/hierarchyBatching.test.ts, packages/three-flatland/src/internal/ecs-handles.ts, packages/three-flatland/src/lights/LightEffect.test.ts, packages/three-flatland/src/lights/LightEffect.ts, packages/three-flatland/src/loaders/texturePacker.test.ts, packages/three-flatland/src/materials/MaterialEffect.test.ts, packages/three-flatland/src/materials/MaterialEffect.ts, packages/three-flatland/src/orchestration/autoBatch.test.ts, packages/three-flatland/src/orchestration/orchestrator.test.ts, packages/three-flatland/src/orchestration/orchestrator.ts, packages/three-flatland/src/orchestration/registry.test.ts, packages/three-flatland/src/orchestration/registry.ts, packages/three-flatland/src/pipeline/PassEffect.ts, packages/three-flatland/src/pipeline/SortLayerGroup.test.ts, packages/three-flatland/src/pipeline/SpriteBatch.test.ts, packages/three-flatland/src/pipeline/SpriteBatch.ts, packages/three-flatland/src/pipeline/SpriteGroup.test.ts, packages/three-flatland/src/pipeline/SpriteGroup.ts, packages/three-flatland/src/pipeline/batchQuery.test.ts, packages/three-flatland/src/pipeline/batchQuery.ts, packages/three-flatland/src/pipeline/tightMesh.test.ts, packages/three-flatland/src/react/activity.test.tsx, packages/three-flatland/src/react/flatland-aspect.test.tsx, packages/three-flatland/src/shadow-pipeline.test.ts, packages/three-flatland/src/sprites/Sprite2D.test.ts, packages/three-flatland/src/sprites/Sprite2D.ts, planning/internal-ecs/results/kernel-baseline.json, planning/internal-ecs/results/kernel-size.json, scripts/verify-public-declaration-boundary.mjs
Stats: 71 files changed, 3599 insertions(+), 3448 deletions(-)
