---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `@three-flatland/bake` package — `flatland-bake` CLI that discovers and dispatches subcommands contributed by packages via `"flatland": { "bakers": [...] }` in their `package.json`
- Baker discovery walks `node_modules` upward from CWD; first-wins on name conflicts; CWD-self-discovery lets package authors iterate without symlinking
- `BakedAssetLoaderOptions.forceRuntime` replaces `skipBakedProbe` across all loaders (`NormalMapLoader`, `SpriteSheetLoader`, `LDtkLoader`, `TiledLoader`, `SlugFontLoader`) — one flag, one pattern
- Dropped `disableRuntimeBake`; runtime bake is always the fallback when normals are requested
- Sidecar helpers: `writeSidecar`, `probeBakedSibling`, `devtimeWarn` for the canonical try-baked → fallback pattern
- Normal descriptor loader and baking script support added

`@three-flatland/bake` ships the extensible `flatland-bake` CLI infrastructure; install `@three-flatland/normals` to gain the `normal` subcommand.
