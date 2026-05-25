---
"@three-flatland/normals": minor
---

> Branch: lighting-stochastic-adoption
> PR: https://github.com/thejustinwalsh/three-flatland/pull/27

- New package `@three-flatland/normals`: offline normal-map baker (`flatland-bake normal`) — reads RGBA PNG, computes 4-neighbor alpha gradient, writes sibling `.normal.png`; eliminates per-fragment GPU cost for sprite normals
- `NormalMapLoader`: runtime loader implementing the canonical "try baked sidecar → runtime TSL fallback" pattern; exposes instance API (R3F `useLoader`-compatible) and static API with URL+descriptor-keyed cache
- `NormalSourceDescriptor` support: loaders accept per-region bake descriptors for sprite sheets and tileset atlases
- `resolveNormalMap`: lazy-imports the baker (~3 kB) only when the runtime fallback fires; stale-sidecar detection warns when hash doesn't match source
- `forceRuntime: true` replaces `skipBakedProbe`/`disableRuntimeBake` — one flag, consistent across all baked-asset loaders
- `NormalMapLoaderStaticOptions` extends `BakedAssetLoaderOptions` so all loaders share a structural type contract
- Cache key uses `hashDescriptor(descriptor)` so multiple callers with different descriptors for the same URL get distinct cache entries
- Dev-time warnings fire at most once per URL, outside `NODE_ENV=production` only
- Lint fixes: unused vars/imports removed, `import type` hoisted, `PingPayload` narrowed to `Record<string, never>`, `JSON.parse` typed as `unknown`

`@three-flatland/normals` delivers a complete offline-bake + runtime-fallback normal-map pipeline; install it to get `flatland-bake normal` and `NormalMapLoader` with zero additional wiring.
