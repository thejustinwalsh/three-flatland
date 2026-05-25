---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

**2D lighting pipeline — normal-map baking & loader infrastructure for the lighting-stochastic-adoption branch.**

### @three-flatland/bake — new CLI package

- `flatland-bake` binary: discovers and dispatches to package-contributed bakers
- Baker registration via `flatland.bake` field in `package.json`; `flatland.bakers` still accepted with a deprecation warning
- CWD self-discovery so package authors iterate without symlinking their own package into `node_modules`
- Sidecar probe utilities (HEAD + PNG tEXt hash check) and sidecar write helpers
- Dev-time warning helper fires at most once per URL, suppressed in `NODE_ENV=production`
- `BakedAssetLoaderOptions` base type with `forceRuntime` flag shared across all baked-asset loaders

### Bug fixes

- Fixed dead `&& header.status !== 206` guard in `sidecar.ts` (unreachable branch after `!header.ok`)
- Fixed USAGE help text to reference canonical `flatland.bake` field (was `flatland.bakers`)
- Moved `setTorchEnabled` off the `useFrame` render loop via `queueMicrotask` in the lighting example to avoid mid-frame React re-renders

### Breaking changes

- `skipBakedProbe` option renamed to `forceRuntime` across `BakedAssetLoaderOptions` and all loaders that consume it; `disableRuntimeBake` removed entirely (runtime bake is the always-on fallback)

Introduces the `@three-flatland/bake` CLI and unifies the baked-asset loader opt-out flag as `forceRuntime` across the entire loader ecosystem.
