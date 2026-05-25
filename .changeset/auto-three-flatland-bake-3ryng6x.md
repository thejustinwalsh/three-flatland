---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

## @three-flatland/bake

### New features

- New `flatland-bake` CLI with automatic baker discovery — packages declare bakers via `"flatland": { "bake": [...] }` in `package.json`; installing a package makes its subcommands appear in `flatland-bake --list` automatically
- CWD-self-discovery: when the CLI runs inside a package that declares its own bakers, those are registered first (supports iterating without symlinking)
- `NormalSourceDescriptor` loader: `flatland-bake normal <sprite.png>` bakes a sibling `.normal.png` from RGBA alpha gradient; accepts `--strength` multiplier

### Breaking changes

- `skipBakedProbe` renamed to `forceRuntime` across `BakedAssetLoaderOptions` and all loaders — update any call sites passing `skipBakedProbe: true` to `forceRuntime: true`
- `disableRuntimeBake` removed; runtime bake is now always the fallback when normals are requested — use `forceRuntime: true` to skip the baked probe entirely
- CLI help text references `flatland.bake` (was `flatland.bakers`); `bakers` is now a legacy alias with a deprecation warning

### Bug fixes

- React `setTorchEnabled` deferred off the `useFrame` loop via `queueMicrotask` — prevents synchronous mid-frame re-renders
- Dead `&& header.status !== 206` guard removed from `sidecar.ts` (was short-circuited by `!header.ok`, no behavior change)

Introduces the `flatland-bake` CLI and unifies all baked-asset loaders under a single `forceRuntime` opt-out flag.

