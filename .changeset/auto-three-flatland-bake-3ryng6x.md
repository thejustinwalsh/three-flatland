---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/bake

**New package** — `@three-flatland/bake` is a unified CLI (`flatland-bake`) that discovers and dispatches asset bakers contributed by workspace or npm packages via a `flatland.bake` manifest in `package.json`.

### CLI and discovery
- New `flatland-bake` binary: `--list` shows available subcommands, bakers auto-register by installing a package that declares `flatland.bake` (or legacy `flatland.bakers`) in its `package.json`
- Baker discovery walks `node_modules` upward from CWD; duplicate names use first-wins with conflict reporting
- CWD-self-discovery: running the CLI inside a package that declares its own bakers registers them ahead of `node_modules` scan (iterate without symlinking)
- CLI help text updated to reference canonical `flatland.bake` field; legacy `flatland.bakers` still accepted with deprecation warning

### Loader option unification
- `skipBakedProbe` renamed to `forceRuntime` across `BakedAssetLoaderOptions`, `NormalMapLoader`, `resolveNormalMap`, `SpriteSheetLoader`, `LDtkLoader`, and `TiledLoader` — matches existing `SlugFontLoader.forceRuntime`
- `disableRuntimeBake` removed; runtime bake is always the fallback when normals are requested
- Docs, READMEs, and tests updated to single-flag pattern: `normals: true | descriptor` to opt in, `forceRuntime: true` to skip the baked probe

### Bug fixes
- Fixed dead `&& header.status !== 206` guard in `sidecar.ts` (unreachable branch — `Response.ok` already covers 200–299)
- React lighting example: `setTorchEnabled` deferred via `queueMicrotask` to avoid mid-frame state updates inside `useFrame`

This release introduces the extensible `flatland-bake` baking infrastructure and standardizes the `forceRuntime` opt-out flag across all baked-asset loaders.
