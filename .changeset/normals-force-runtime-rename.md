---
"@three-flatland/bake": minor
"@three-flatland/normals": minor
"three-flatland": minor
---

## Unify baked-asset loader opt-out as `forceRuntime`

Every baked-asset loader in the codebase now exposes the same single flag — `forceRuntime: true` — to skip the sidecar probe and go straight to runtime generation. Mirrors `SlugFontLoader.forceRuntime`, which is the canonical pattern.

### Renames
- `BakedAssetLoaderOptions.skipBakedProbe` → `forceRuntime`
- `SpriteSheetLoaderOptions.skipBakedProbe` → `forceRuntime`
- `LDtkLoaderOptions.skipBakedProbe` → `forceRuntime`
- `TiledLoaderOptions.skipBakedProbe` → `forceRuntime`
- `NormalMapLoader.skipBakedProbe` (instance + static `load()`) → `forceRuntime`
- `ResolveNormalMapOptions.skipBakedProbe` → `forceRuntime`

### Removed
- `LDtkLoaderOptions.disableRuntimeBake` (+ instance property)
- `SpriteSheetLoaderOptions.disableRuntimeBake` (+ instance property)
- `NormalMapLoader.disableRuntimeBake` (instance + static `load()` option)
- `ResolveNormalMapOptions.disableRuntimeBake`

The previous `disableRuntimeBake` opt-out conflated two intents into a second flag. The unified model is simpler: **opt in to normals (`normals: true | descriptor`), and they're guaranteed to load** — baked sidecar if available, in-memory bake on miss, devtime warn when the runtime path fires. `forceRuntime: true` is the single dev-iteration knob to skip the probe.

### Migration
```diff
- SpriteSheetLoader.load(url, { normals: true, skipBakedProbe: true })
+ SpriteSheetLoader.load(url, { normals: true, forceRuntime: true })

- SpriteSheetLoader.load(url, { normals: { disableRuntimeBake: true } })
+ SpriteSheetLoader.load(url, { normals: true })  // runtime bake is now always the fallback
```
