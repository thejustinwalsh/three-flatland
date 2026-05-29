---
"@three-flatland/bake": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New `@three-flatland/bake` package: extensible `flatland-bake` CLI with plugin-based baker discovery via `"flatland": { "bake": [...] }` in `package.json`
- Discovery walks `node_modules` upward from CWD; tolerates scoped packages, missing dirs, and malformed manifests; CWD self-discovery lets package authors iterate without symlinks
- Installing `@three-flatland/normals` automatically registers `flatland-bake normal <input.png>` as a subcommand
- Normal descriptor loader and sidecar write support added to bake infrastructure
- Unified baked-asset loader opt-out: `skipBakedProbe` renamed to `forceRuntime`; `disableRuntimeBake` removed (runtime bake is always the fallback when normals are requested)
- USAGE help text corrected to reference canonical `flatland.bake` field instead of legacy `flatland.bakers`
- `setState` inside `useFrame` in the lighting example deferred via `queueMicrotask` to prevent mid-frame re-renders
- Dead `&& header.status !== 206` guard removed from `sidecar.ts` (redundant with `!header.ok`)

## BREAKING CHANGES

- `skipBakedProbe` renamed to `forceRuntime` in `BakedAssetLoaderOptions` and all loader option types
- `disableRuntimeBake` option removed; use `forceRuntime: true` instead

Introduces the `flatland-bake` CLI and unifies all baked-asset loader options under a single `forceRuntime` flag.
