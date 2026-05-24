---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**New `@three-flatland/bake` package** — unified `flatland-bake` CLI and extensible baker framework for offline asset processing.

**CLI & baker discovery**
- `flatland-bake` binary discovers and dispatches to bakers contributed via a `flatland.bake` manifest field in any workspace or npm package
- Discovery walks `node_modules` upward from CWD; tolerates scoped packages, missing dirs, and malformed manifests; first-wins on duplicate names
- CWD-self-discovery: CLI running inside a package that declares its own bakers registers them first, letting authors iterate without symlinking
- `flatland-bake --list` shows all discovered bakers; bakers export `{ name, description, run(args), usage? }`

**Shared loader option type**
- `BakedAssetLoaderOptions` introduces `forceRuntime?: boolean` — the single opt-out flag adopted by all baked-asset loaders (`NormalMapLoader`, `SlugFontLoader`, `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`)
- `skipBakedProbe` renamed to `forceRuntime`; `disableRuntimeBake` dropped (runtime bake is always-on when normals are requested)

**Bug fixes**
- CLI USAGE text updated to reference `flatland.bake` (was incorrectly referencing legacy `flatland.bakers`)
- Dead `&& header.status !== 206` guard removed from sidecar probe
- React lighting example: `setTorchEnabled` deferred off the `useFrame` loop via `queueMicrotask` to prevent synchronous mid-frame re-renders

This release introduces the `flatland-bake` CLI and the shared `BakedAssetLoaderOptions` type that unifies opt-out semantics across every baked-asset loader.
