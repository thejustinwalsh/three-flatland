---
"@three-flatland/bake": minor
"@three-flatland/normals": minor
"three-flatland": minor
---

## Unify baked-asset loader runtime flag as `forceRuntime`

Every baked-asset loader in the codebase now exposes the same single flag — `forceRuntime: true` — declaring that the browser is where this asset's derived data is produced (instead of a CI bake step). The contract is unchanged: if you ask for the data, you get it. The flag only chooses *where* generation happens. Mirrors `SlugFontLoader.forceRuntime`, which is the canonical pattern.

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

The previous `disableRuntimeBake` flag conflated two intents into a second option. The unified model is simpler: **opt in to normals (`normals: true | descriptor`), and they're guaranteed to load** — baked sidecar if available, in-memory bake on miss, devtime warn when the runtime path fires. There is no "no normals" fallback; the engine never silently fails on a missing asset.

`forceRuntime: true` is the project-level architectural choice for a specific asset: the browser is where its normal map is produced, on every load, no sidecar exists for it by design. Use for procedurally varied content, throwaway prototypes, or lean bundles. **Not** a dev-iteration knob; the default path (probe → bake on miss + warn) already handles iteration.

### Migration
```diff
- SpriteSheetLoader.load(url, { normals: true, skipBakedProbe: true })
+ SpriteSheetLoader.load(url, { normals: true, forceRuntime: true })

- SpriteSheetLoader.load(url, { normals: { disableRuntimeBake: true } })
+ SpriteSheetLoader.load(url, { normals: true })  // runtime bake is now always the fallback
```
