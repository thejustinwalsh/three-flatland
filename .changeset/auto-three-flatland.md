---
"three-flatland": major
---

Initial alpha release of `three-flatland` — the consolidated core + React package for high-performance 2D sprites, tilemaps, and effects on Three.js WebGPU.

**Core rendering pipeline:**
- `Sprite2D` and `AnimatedSprite2D` — GPU-instanced 2D sprites with anchor, layer, and zIndex support
- `SpriteGroup` and `SpriteBatch` — automatic batching of sprites sharing the same material into single draw calls
- `LayerManager` — decoupled render order (layer + zIndex) independent from scene graph hierarchy
- `PassEffect` — composable post-processing pass effects
- `Sprite2DMaterial` and `EffectMaterial` — TSL-based materials with per-instance attribute support

**Animation system:**
- `AnimationController` — spritesheet-driven frame animation with timing, callbacks, and state machine support

**Loaders:**
- `TextureLoader` — WebGPU-compatible texture loading
- `SpriteSheetLoader` — JSON spritesheet format loading with frame lookup

**Tilemap support:**
- `TileMap2D`, `TileLayer`, `Tileset` — tilemap rendering with animated tile support
- `TiledLoader` — Tiled editor JSON format
- `LDtkLoader` — LDtk editor format

**React Three Fiber integration (`three-flatland/react`):**
- First-class R3F integration with full JSX type augmentation for `ThreeElements`
- Suspense-compatible resource loading hooks
- React subpath wrappers restructured to directory layout (`src/react/{name}/index.ts`) for cleaner deep imports like `three-flatland/react/sprites`
- `sideEffects: false` — types augmentation is now explicitly imported, not side-effectful

**Package / build:**
- `source` export condition on all subpaths for monorepo dev without building
- Wildcard deep subpath exports for all categories (`./sprites/*`, `./animation/*`, etc.)
- Build switched from `treeshake: true` to `bundle: false` (unbundled output)
- `process.env.NODE_ENV` check in `measure` utility made safe for environments without `process` (browser/worker-friendly)
- README and LICENSE added

## BREAKING CHANGES

- Package renamed from internal `@three-flatland/core` (+ separate `packages/react`) to the single public package `three-flatland`; all imports must be updated
- `sideEffects` removed from package exports — `three-flatland/react/types` augmentation no longer auto-applies; import `three-flatland/react` (or the react entry) explicitly
- React subpath wrappers moved from flat files to directories; `three-flatland/react/sprites` etc. now resolve to `dist/react/sprites/index.js`

This is the first public alpha of `three-flatland`, consolidating the previously internal `core` and `react` packages into a single tree-shakeable package with full WebGPU support.
